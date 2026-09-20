import { describe, expect, it, vi } from 'vitest';

import { createComponent, internalState, type ComponentProps } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, percent, type UiChild, type UiNode } from 'gesso-core';
import { Alert } from './Alert';

/**
 * A banner across a region, which is the shape it is designed for: a
 * root fills the window, so a banner mounted bare would be as tall as
 * the window and every assertion about its box would be an assertion
 * about the window instead.
 */
function mount(props: ComponentProps<typeof Alert>) {
  const alert: UiChild = createComponent(Alert, { width: percent(100), ...props });
  return renderTest(Column({ padding: 8, width: 480, height: 240 }, alert), { width: 480, height: 240 });
}

/**
 * The banner itself, found by the radius rather than by a role, because
 * half of what is asserted below is *which* role it declares.
 */
function banner(ui: ReturnType<typeof mount>): UiNode {
  const node = ui.allNodes().find(candidate => candidate.properties.get('borderRadius') === 8);
  if (node === undefined) {
    throw new Error(`No alert in the tree.\n\n${ui.debug()}`);
  }
  return node;
}

/** Every text drawn anywhere in the tree. */
function texts(ui: ReturnType<typeof mount>): unknown[] {
  return ui
    .allNodes()
    .map(node => node.properties.get('text'))
    .filter(text => text !== undefined);
}

describe('Alert', () => {
  it('carries its tone in the edge and the title, on one shared sheet', () => {
    const neutral = mount({ title: 'Heads up', message: 'A note.' });
    const accent = mount({ title: 'Heads up', message: 'A note.', tone: 'accent' });
    const danger = mount({ title: 'Payment failed', message: 'A note.', tone: 'danger' });

    // The ground is the same under all three. A banner is the width of
    // a region, and a `danger` wall across one is louder than any
    // message that goes in it.
    for (const ui of [neutral, accent, danger]) {
      expect(banner(ui).properties.get('backgroundColor')).toBe('controlBackground');
      expect(banner(ui).properties.get('borderWidth')).toBe(1);
    }

    const edges = [neutral, accent, danger].map(ui => banner(ui).properties.get('borderColor'));
    expect(edges).toEqual(['controlBorder', 'controlAccent', 'danger']);
    // Three tones, three edges: the whole point of a tone is that a
    // failed payment does not look like a note.
    expect(new Set(edges).size).toBe(3);

    expect(neutral.getByText('Heads up').properties.get('color')).toBe('controlForeground');
    expect(accent.getByText('Heads up').properties.get('color')).toBe('controlAccent');
    expect(danger.getByText('Payment failed').properties.get('color')).toBe('danger');
    // The body stays prose on all three. The tone is said once.
    expect(danger.getByText('A note.').properties.get('color')).toBe('textMuted');
  });

  it('is a polite status by default, because a banner that appears is news', () => {
    const ui = mount({ title: 'Saved', message: 'Your changes are in.' });
    const record = ui.getSemantics(ui.getByRole('status'));

    expect(record.role).toBe('status');
    expect(record.live).toBe('polite');
    expect(record.label).toBe('Saved');
  });

  it('interrupts only for danger, which is the one tone worth interrupting for', () => {
    const bad = mount({ title: 'Payment failed', message: 'We could not charge your card.', tone: 'danger' });
    const record = bad.getSemantics(bad.getByRole('alert'));

    expect(record.role).toBe('alert');
    expect(record.live).toBe('assertive');
    expect(bad.queryByRole('status')).toBeNull();

    // Every other live banner waits its turn. A library that made all
    // of them assertive would teach people to turn announcements off.
    for (const tone of ['neutral', 'accent'] as const) {
      const quiet = mount({ title: 'Saved', tone });
      expect(quiet.queryByRole('alert')).toBeNull();
      expect(quiet.getSemantics(quiet.getByRole('status')).live).toBe('polite');
    }
  });

  it('is a named region with no live region when it is the standing banner', () => {
    const ui = mount({ title: 'Trial ends Friday', message: 'Add a card to keep your projects.', live: false });
    const record = ui.getSemantics(ui.getByRole('region'));

    expect(record.role).toBe('region');
    expect(record.label).toBe('Trial ends Friday');
    // Nothing about a notice that was there at load has changed, so
    // there is nothing to announce, and announcing it every time focus
    // passes is the defect `Badge` refuses to commit.
    expect(record.live).toBeUndefined();
    expect(ui.queryByRole('status')).toBeNull();
    expect(ui.queryByRole('alert')).toBeNull();
  });

  it('keeps its prose readable and its button reachable, because the container is labelled', () => {
    const ui = mount({ title: 'Payment failed', message: 'We could not charge your card.', onDismiss: () => {} });

    // A labelled container claims nothing: the name introduces the
    // banner and the text inside it stays on the tree as prose. An
    // unlabelled one would swallow both lines *and* the button.
    expect(ui.getSemantics(ui.getByText('We could not charge your card.')).label).toBe(
      'We could not charge your card.'
    );
    expect(ui.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('is named by its message when there is no title, because a region has to be named', () => {
    const ui = mount({ message: 'These numbers are an hour old.' });

    expect(ui.getSemantics(ui.getByRole('status')).label).toBe('These numbers are an hour old.');
    // No title means no title line, rather than a blank one taking up
    // a line's height.
    expect(texts(ui)).toEqual(['These numbers are an hour old.']);
  });

  it('follows its title, its message and its paint as they change', () => {
    const title = internalState('Uploading');
    const message = internalState('3 files left');
    const tone = internalState<'neutral' | 'accent' | 'danger'>('accent');
    const ui = mount({ title, message, tone });

    expect(ui.getSemantics(ui.getByRole('status')).label).toBe('Uploading');
    expect(banner(ui).properties.get('borderColor')).toBe('controlAccent');

    title.value = 'Upload finished';
    message.value = 'All 12 files are in.';
    tone.value = 'neutral';
    ui.frame();

    // The words and the colours are bound. The role is not: the banner
    // stays a polite `status` although its tone is no longer `accent`,
    // because a live region that changed its urgency under an assistive
    // technology's feet would announce nothing at the moment it
    // mattered.
    expect(ui.getSemantics(ui.getByRole('status')).label).toBe('Upload finished');
    expect(ui.getByText('All 12 files are in.')).toBeTruthy();
    expect(banner(ui).properties.get('borderColor')).toBe('controlBorder');
  });

  it('keeps the role it was built with, so a tone that turns dangerous changes the key instead', () => {
    const tone = internalState<'neutral' | 'accent' | 'danger'>('neutral');
    const ui = mount({ title: 'Syncing', tone });

    tone.value = 'danger';
    ui.frame();

    expect(banner(ui).properties.get('borderColor')).toBe('danger');
    expect(ui.queryByRole('alert')).toBeNull();
    expect(ui.getSemantics(ui.getByRole('status')).live).toBe('polite');
  });

  it('calls onDismiss and nothing else, because the tree is the caller’s', () => {
    const onDismiss = vi.fn();
    const ui = mount({ title: 'Saved', message: 'Your changes are in.', onDismiss });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Dismiss' }));
    ui.frame();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Still there. Whether a dismissed banner is in the tree is the
    // caller's conditional, because only the caller knows whether
    // dismissing means for this render, this session or for good.
    expect(ui.getByRole('status')).toBeTruthy();
    expect(ui.getByText('Saved')).toBeTruthy();
  });

  it('draws no button at all when there is nothing to call', () => {
    const ui = mount({ title: 'Trial ends Friday', live: false });

    expect(ui.queryByRole('button')).toBeNull();
    expect(ui.queryByText('Dismiss')).toBeNull();
  });

  it('passes the caller its layout props', () => {
    const ui = mount({ title: 'Saved', marginTop: 6 });

    expect(banner(ui).properties.get('marginTop')).toBe(6);
  });
});

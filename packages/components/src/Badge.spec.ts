import { describe, expect, it, vi } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';
import { Column, type UiChild, type UiNode } from '@gesso/core';
import { Badge, type BadgeProps } from './Badge';

/**
 * A badge in the corner of a window, at its own size. A root fills the
 * window, so a badge mounted bare would be 200 pixels square and every
 * assertion about its box would be an assertion about the window.
 */
function mount(props: Partial<BadgeProps>) {
  const badge: UiChild = createComponent(Badge, props);
  return renderTest(Column({ padding: 8, x: 'start', width: 200, height: 200 }, badge), { width: 200, height: 200 });
}

/**
 * The pill itself.
 *
 * Found by the radius rather than by a role, because the point of most
 * of these tests is that a badge declares no role at all and so cannot
 * be reached the way an assistive technology reaches a control.
 */
function pill(ui: ReturnType<typeof mount>): UiNode {
  const node = ui.allNodes().find(candidate => candidate.properties.get('borderRadius') === 999);
  if (node === undefined) {
    throw new Error(`No badge in the tree.\n\n${ui.debug()}`);
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

describe('Badge', () => {
  // First in the file on purpose: the warning is said once per process,
  // so this is the only test allowed to mount a nameless dot.
  it('warns once that a dot with no name says nothing to a screen reader', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount({ dot: true });
      mount({ dot: true });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('`dot`');
      expect(warn.mock.calls[0][0]).toContain('name=');

      warn.mockClear();
      mount({ dot: true, name: 'Unsaved changes' });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('paints each tone on its own ground, in palette names', () => {
    const neutral = pill(mount({ label: 'Beta' }));
    const accent = pill(mount({ label: 'New', tone: 'accent' }));
    const danger = pill(mount({ label: 'Failed', tone: 'danger' }));

    expect(neutral.properties.get('backgroundColor')).toBe('controlBackground');
    expect(accent.properties.get('backgroundColor')).toBe('controlAccent');
    expect(danger.properties.get('backgroundColor')).toBe('danger');

    // Three grounds, and three different ones: the whole point of a
    // tone is that a failed badge does not look like a count.
    const grounds = [neutral, accent, danger].map(node => node.properties.get('backgroundColor'));
    expect(new Set(grounds).size).toBe(3);

    // Only the quiet tone has an edge, because its ground is the colour
    // of the surface it sits on.
    expect(neutral.properties.get('borderWidth')).toBe(1);
    expect(neutral.properties.get('borderColor')).toBe('controlBorder');
    expect(accent.properties.get('borderWidth')).toBe(0);
    expect(danger.properties.get('borderWidth')).toBe(0);
  });

  it('draws words that stay legible on whichever ground they are on', () => {
    const quiet = mount({ label: 'Beta' });
    const loud = mount({ label: 'Failed', tone: 'danger' });

    expect(quiet.getByText('Beta').properties.get('color')).toBe('controlForeground');
    // The pairing the filled button makes for the same tone: the
    // sheet's colour on the loud ground, which inverts with the
    // appearance by itself.
    expect(loud.getByText('Failed').properties.get('color')).toBe('controlBackground');
  });

  it('draws a count as itself until it passes max, and then as 99+', () => {
    expect(texts(mount({ count: 3 }))).toEqual(['3']);
    expect(texts(mount({ count: 99 }))).toEqual(['99']);
    expect(texts(mount({ count: 100 }))).toEqual(['99+']);
    // A max of its own, so "99+" is never the caller's arithmetic.
    expect(texts(mount({ count: 12, max: 9 }))).toEqual(['9+']);
    // Nothing to count is still a count: whether the badge should be
    // there at all is the caller's conditional.
    expect(texts(mount({ count: 0 }))).toEqual(['0']);
    // A count is the more specific of the two, so it wins.
    expect(texts(mount({ count: 5, label: 'Beta' }))).toEqual(['5']);
  });

  it('declares nothing at all when it is decorative, and is read as prose anyway', () => {
    const ui = mount({ count: 3 });

    expect(ui.queryByRole('status')).toBeNull();
    expect(ui.queryByRole('image')).toBeNull();
    // The pill says nothing. The figure inside it is prose, and the
    // semantics tree gives prose a record of its own, so "3" is still
    // read by a reader walking the region it sits in.
    expect(ui.querySemantics(pill(ui))).toBeNull();
    expect(ui.getSemantics(ui.getByText('3')).label).toBe('3');
  });

  it('takes a name the drawn text cannot be, and is announced once', () => {
    const ui = mount({ count: 3, name: '3 unread messages' });

    expect(ui.getByRole('image')).toHaveSemantics({ role: 'image', name: '3 unread messages' });
    // `image` makes the pill's children presentational, which is what
    // stops the figure being announced as itself and then as its name.
    expect(ui.querySemantics(ui.getByText('3'))).toBeNull();
  });

  it('is a polite status only when live says so', () => {
    const quiet = mount({ count: 3 });
    expect(quiet.querySemantics(pill(quiet))).toBeNull();

    const announced = mount({ count: 3, live: true });
    const record = announced.getSemantics(announced.getByRole('status'));
    expect(record.role).toBe('status');
    expect(record.live).toBe('polite');
    // With no name of its own, a live badge is named by what it draws,
    // which is the value the announcement is about.
    expect(record.label).toBe('3');

    const named = mount({ count: 3, live: true, name: '3 unread messages' });
    expect(named.getSemantics(named.getByRole('status')).label).toBe('3 unread messages');
  });

  it('draws no text as a dot, and is a circle rather than a pill', () => {
    const ui = mount({ dot: true, name: 'Unsaved changes' });

    expect(texts(ui)).toEqual([]);
    const box = ui.getLayout(pill(ui));
    expect(box.width).toBe(box.height);
    expect(box.width).toBe(8);
  });

  it('passes the caller its layout props and its root modifiers', () => {
    const ui = mount({ label: 'Beta', marginLeft: 6 });
    expect(pill(ui).properties.get('marginLeft')).toBe(6);
    // A badge has no modifier of its own, and still has to be reachable
    // by one: `rootModifiers` is the seam a motion needs.
    expect(pill(ui).properties.get('hitTestable')).toBe(false);
  });
});

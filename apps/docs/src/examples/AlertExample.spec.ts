import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Billing } from './AlertExample';

const mount = () => renderTest(createComponent(Billing, {}), { width: 720, height: 380 });

/**
 * The page claims four things about `Alert`: that a standing banner is
 * a named region with nothing to announce, that a danger banner
 * interrupts while every other live banner waits its turn, that the
 * dismiss control is a real button with a name, and that dismissing is
 * the caller's conditional rather than the component hiding itself.
 * Each is a test here, reached the way an assistive technology reaches
 * it.
 */
describe('the docs alert example', () => {
  it('leaves the standing banner as a named region with no live region', () => {
    const ui = mount();
    const record = ui.getSemantics(ui.getByRole('region'));

    expect(record.role).toBe('region');
    expect(record.label).toBe('Trial ends Friday');
    expect(record.live).toBeUndefined();
  });

  it('interrupts for the declined card and waits its turn for the sync', () => {
    const ui = mount();

    const failure = ui.getSemantics(ui.getByRole('alert'));
    expect(failure.label).toBe('Payment failed');
    expect(failure.live).toBe('assertive');
    // Nothing polite is on the page yet: the sync banner is not there.
    expect(ui.queryByRole('status')).toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Sync invoices' }));
    ui.frame();

    const sync = ui.getSemantics(ui.getByRole('status'));
    expect(sync.label).toBe('Invoices are syncing');
    expect(sync.live).toBe('polite');
  });

  it('keeps the prose inside a banner readable beside its name', () => {
    const ui = mount();

    // The banner is a labelled container, so its name introduces it and
    // the sentence under the title is still a record of its own.
    expect(ui.getByText('Add a card before the 24th to keep your three projects.')).toBeTruthy();
    expect(
      ui.getSemantics(ui.getByText('We could not charge the card ending 4242. Nothing was lost; try another one.'))
        .label
    ).toBe('We could not charge the card ending 4242. Nothing was lost; try another one.');
  });

  it('dismisses by the example removing the banner, not by the banner hiding itself', () => {
    const ui = mount();

    // A real button with a name, not a glyph a reader can only call
    // "button".
    ui.fireEvent.click(ui.getByRole('button', { name: 'Dismiss' }));
    ui.frame();

    expect(ui.queryByRole('alert')).toBeNull();
    expect(ui.queryByText('Payment failed')).toBeNull();
    // The standing banner is untouched: each one is its own conditional.
    expect(ui.getByRole('region')).toBeTruthy();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Retry payment' }));
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('alert')).label).toBe('Payment failed');
  });

  it('only draws a dismiss control on the banner that was given one', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Sync invoices' }));
    ui.frame();

    // One Dismiss on the page, on the danger banner. The standing
    // notice and the sync status were given no `onDismiss`, so they
    // draw no button at all.
    const dismissers = ui.allNodes().filter(node => node.properties.get('label') === 'Dismiss');
    expect(dismissers).toHaveLength(1);
  });
});

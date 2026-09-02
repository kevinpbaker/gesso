// #region imports
import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { TicketRow } from './TestingExample';
// #endregion imports

// #region mount
/**
 * One mount, shared by every test below.
 *
 * `renderTest` builds the runtime over a recording canvas, measures
 * text with the deterministic measurer, and runs the first frame, so
 * the tree is built, laid out and described before the first query.
 */
const mount = () => renderTest(createComponent(TicketRow, {}), { width: 420, height: 220 });
// #endregion mount

/**
 * What the testing page claims about this row, one claim per test.
 *
 * Every control is reached by role and accessible name, never by
 * walking the tree to the third child of the second row, because the
 * queries read the same semantics tree the accessibility mirror
 * writes: a control this file cannot find is a control a screen reader
 * cannot find either.
 */
describe('the docs testing example', () => {
  // #region roles
  it('is reachable by role and name, and nothing else is announced', () => {
    const ui = mount();

    expect(ui.getByRole('button', { name: 'One more ticket' })).toHaveSemantics({ role: 'button' });
    expect(ui.getByRole('checkbox', { name: 'Gift wrap this order' })).toHaveSemantics({ states: [] });

    // The glyph is not the name. A query for it finds nothing, which is
    // the answer a screen reader would give too.
    expect(ui.queryByRole('button', { name: '+' })).toBeNull();

    // `getByText` reads what a node draws, so it finds the summary line
    // that has no role of its own.
    expect(ui.getByText('1 ticket')).toBeDefined();
  });
  // #endregion roles

  // #region click
  it('counts up when the stepper is clicked', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('button', { name: 'One more ticket' }));
    ui.frame();

    expect(ui.getByText('2 tickets')).toBeDefined();
  });
  // #endregion click

  // #region keyboard
  it('ticks the checkbox from the keyboard alone', () => {
    const ui = mount();
    const gift = ui.getByRole('checkbox', { name: 'Gift wrap this order' });

    ui.fireEvent.focus(gift);
    ui.fireEvent.press(' ');
    ui.frame();

    expect(gift).toHaveFocus();
    expect(gift).toHaveSemantics({ states: ['checked'] });
    expect(ui.getByText('1 ticket, gift wrapped')).toBeDefined();
  });
  // #endregion keyboard

  // #region disabled
  it('stops at zero, and is announced as unavailable rather than going quiet', () => {
    const ui = mount();
    const fewer = ui.getByRole('button', { name: 'One fewer ticket' });

    ui.fireEvent.click(fewer);
    ui.frame();

    expect(ui.getByText('0 tickets')).toBeDefined();
    expect(fewer).toHaveSemantics({ disabled: true });

    // Disabled means inert, not merely grey: the click does not reach
    // the handler, so the count cannot go negative.
    ui.fireEvent.click(fewer);
    ui.frame();

    expect(ui.getByText('0 tickets')).toBeDefined();
  });
  // #endregion disabled

  // #region layout
  it('holds the count in a fixed width, so the row does not move as the number grows', () => {
    const ui = mount();
    const more = ui.getByRole('button', { name: 'One more ticket' });
    const before = ui.getLayout(more).x;

    expect(ui.getByText('1')).toHaveBox({ width: 36 });

    for (let click = 0; click < 5; click++) {
      ui.fireEvent.click(more);
      ui.frame();
    }

    expect(ui.getByText('6')).toHaveBox({ width: 36 });
    expect(ui.getLayout(more).x).toBe(before);
  });
  // #endregion layout
});

import { describe, expect, it } from 'vitest';

import type { UiNode } from 'gesso-core';
import { renderTest, type Rendered } from 'gesso-testing';
import { createComponent } from 'gesso-framework';
import 'gesso-testing/matchers';

import { RangeSliders } from './RangeSliderExample';

const SIZE = { width: 460, height: 300 };

function example() {
  return renderTest(createComponent(RangeSliders, {}), SIZE);
}

/**
 * The track strip: the second child of the group that is the range
 * slider. The track carries no role of its own, since the thumbs are
 * what is announced, so this is how a test reaches the node that
 * measures itself.
 */
function stripOf(ui: Pick<Rendered, 'getByRole'>, name: string): UiNode {
  const strip = ui.getByRole('group', { name }).firstChild?.nextSibling;
  if (strip === null || strip === undefined) {
    throw new Error(`the ${name} range has no track`);
  }
  return strip;
}

/**
 * What the page claims: each thumb is a slider of its own, named from
 * the label or named outright, announcing a range that stops at the
 * other thumb; the keys in the table move one thumb and never past the
 * other; a press moves the nearer thumb; and the application owns the
 * controlled pair while the uncontrolled one owns itself.
 */
describe('the docs range slider example', () => {
  it('names each thumb and announces how far it can go', () => {
    const ui = example();

    expect(ui.getByRole('group', { name: 'Price' })).toHaveSemantics({ role: 'group', name: 'Price' });
    // $50 apart at least, so each thumb stops $50 short of the other.
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Minimum price' }))).toMatchObject({
      valueNow: 100,
      valueMin: 0,
      valueMax: 250,
      valueText: '$100'
    });
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Maximum price' }))).toMatchObject({
      valueNow: 300,
      valueMin: 150,
      valueMax: 500,
      valueText: '$300'
    });
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Check in' })).valueNow).toBe(10);
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Check out' })).valueNow).toBe(14);
    expect(ui.getByText('5 of 10 hotels a night between $100 and $300')).toBeDefined();
  });

  it('moves one thumb with the keys the table lists, never past the other', () => {
    const ui = example();
    const checkIn = ui.getByRole('slider', { name: 'Check in' });
    const checkOut = ui.getByRole('slider', { name: 'Check out' });
    const stay = (): [number | undefined, number | undefined] => {
      ui.frame();
      return [ui.getSemantics(checkIn).valueNow, ui.getSemantics(checkOut).valueNow];
    };

    ui.fireEvent.focus(checkIn);
    ui.fireEvent.press('ArrowRight');
    expect(stay()).toEqual([11, 14]);
    // End takes the thumb as far as it may go: one night short of check out.
    ui.fireEvent.press('End');
    expect(stay()).toEqual([13, 14]);
    ui.fireEvent.press('ArrowUp');
    expect(stay()).toEqual([13, 14]);
    // A page is a tenth of the range, 3, or one step, whichever is larger.
    ui.fireEvent.press('PageDown');
    expect(stay()).toEqual([10, 14]);
    ui.fireEvent.press('Home');
    expect(stay()).toEqual([1, 14]);

    ui.fireEvent.focus(checkOut);
    ui.fireEvent.press('Home');
    expect(stay()).toEqual([1, 2]);
    ui.fireEvent.press('ArrowLeft');
    ui.fireEvent.press('ArrowDown');
    expect(stay()).toEqual([1, 2]);
    ui.fireEvent.press('PageUp');
    expect(stay()).toEqual([1, 5]);
    ui.fireEvent.press('End');
    expect(stay()).toEqual([1, 31]);
  });

  it('moves the nearer thumb to a press on the track, and the application hears it', () => {
    const ui = example();
    const strip = stripOf(ui, 'Price');
    ui.frame();
    const box = ui.getLayout(strip);
    const y = box.y + box.height / 2;

    // $400 is nearer the high thumb at $300 than the low one at $100.
    ui.fireEvent.pointerDown(box.x + box.width * 0.8, y);
    ui.fireEvent.pointerUp(box.x + box.width * 0.8, y);
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Maximum price' })).valueNow).toBe(400);
    expect(ui.getByRole('slider', { name: 'Maximum price' })).toHaveFocus();
    expect(ui.getByText('6 of 10 hotels a night between $100 and $400')).toBeDefined();
  });

  it('takes a pair written with no gesture behind it', () => {
    const ui = example();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Any price' }));
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Minimum price' })).valueNow).toBe(0);
    expect(ui.getSemantics(ui.getByRole('slider', { name: 'Maximum price' })).valueNow).toBe(500);
    expect(ui.getByText('10 of 10 hotels a night between $0 and $500')).toBeDefined();
  });
});

import { describe, expect, it } from 'vitest';

import type { LayoutBox, UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { PointerSurface } from './PointerExample';

const SIZE = { width: 460, height: 320 };

function surface(): Rendered {
  return renderTest(createComponent(PointerSurface, {}), SIZE);
}

/** The middle of a node's box, rounded the way the example rounds it. */
function centreOf(ui: Rendered, node: UiNode): { x: number; y: number } {
  const box: LayoutBox = ui.getLayout(node);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** A whole press at a point, through the hit tester. */
function pressAt(ui: Rendered, point: { x: number; y: number }): void {
  ui.fireEvent.pointerDown(point.x, point.y);
  ui.fireEvent.pointerUp(point.x, point.y);
  ui.frame();
}

/** What one of the four readout lines currently says. */
function readout(ui: Rendered, prefix: RegExp): string {
  return String(ui.getByText(prefix).getProperty('text'));
}

/**
 * The page's claims, each measured through the path a real pointer and
 * a real keyboard take: `pointerDown` goes through the hit tester at a
 * coordinate, `tab` through the focus manager, `press` through the
 * keyboard controller. Nothing here calls a handler directly, because a
 * handler that answers while the node is unreachable is the failure
 * this spec exists to catch.
 */
describe('the docs pointer and keyboard example', () => {
  it('routes a press to the topmost node under the point, then bubbles it', () => {
    const ui = surface();
    const point = centreOf(ui, ui.getByText('a chip'));

    pressAt(ui, point);

    // The hit test landed on the label inside the chip, which has no
    // listener of its own, so the panel heard it on the way up.
    expect(readout(ui, /^pressed /)).toBe(`pressed a child of it at ${point.x}, ${point.y}`);
  });

  it('skips a pointerEvents="none" subtree and hands the point to what is under it', () => {
    const ui = surface();
    const point = centreOf(ui, ui.getByText('pointerEvents none'));

    pressAt(ui, point);

    // The same shape of press, at a point genuinely inside that box:
    // the coordinates are its own centre, and the panel still reports
    // itself as the target.
    expect(readout(ui, /^pressed /)).toBe(`pressed the panel at ${point.x}, ${point.y}`);
  });

  it('enters and leaves the panel on its subtree boundary', () => {
    const ui = surface();

    const chip = centreOf(ui, ui.getByText('a chip'));
    ui.fireEvent.pointerMove(chip.x, chip.y);
    ui.frame();
    expect(readout(ui, /^hovering /)).toBe('hovering the panel');

    // Moving to the second chip stays inside the panel's subtree, so
    // nothing left and nothing re-entered.
    const other = centreOf(ui, ui.getByText('pointerEvents none'));
    ui.fireEvent.pointerMove(other.x, other.y);
    ui.frame();
    expect(readout(ui, /^hovering /)).toBe('hovering the panel');

    // The example's own padding, outside the panel entirely.
    ui.fireEvent.pointerMove(2, 2);
    ui.frame();
    expect(readout(ui, /^hovering /)).toBe('hovering nothing');
  });

  it('walks the tab stops in document order and wraps', () => {
    const ui = surface();
    expect(readout(ui, /^focus is on /)).toBe('focus is on nothing');

    for (const expected of ['First', 'Second', 'the stepper', 'First']) {
      ui.fireEvent.tab();
      ui.frame();
      expect(readout(ui, /^focus is on /)).toBe(`focus is on ${expected}`);
    }

    // Backwards from the first stop wraps to the last.
    ui.fireEvent.shiftTab();
    ui.frame();
    expect(readout(ui, /^focus is on /)).toBe('focus is on the stepper');
  });

  it('focuses the nearest focusable node at or above a press', () => {
    const ui = surface();

    // The press lands on the label inside the button, which is not
    // itself focusable; focus walks up to the button that is.
    pressAt(ui, centreOf(ui, ui.getByText('Second')));
    expect(readout(ui, /^focus is on /)).toBe('focus is on Second');

    // A press on the panel finds nothing focusable above it, and
    // leaves focus where it was rather than dropping it.
    pressAt(ui, centreOf(ui, ui.getByText('a chip')));
    expect(readout(ui, /^focus is on /)).toBe('focus is on Second');
  });

  it('sends a key to the focused node, or to the app root when nothing has focus', () => {
    const ui = surface();

    // Nothing focused: the key goes to the application's root, which is
    // the example's own column, so its listener hears it. That is what
    // lets an app answer Escape or Space with nothing focused.
    ui.fireEvent.press('Escape');
    ui.frame();
    expect(readout(ui, /^last key: /)).toBe('last key: Escape');

    ui.fireEvent.focus(ui.getByRole('button', { name: 'First' }));
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    // It reached the focused button and bubbled to the column above it,
    // and the stepper, which is not an ancestor of the button, never
    // saw it.
    expect(readout(ui, /^last key: /)).toBe('last key: ArrowRight');
    expect(ui.getByText('steps: 0')).toBeDefined();

    // Two more stops along is the stepper, which does answer to them.
    ui.fireEvent.tab();
    ui.fireEvent.tab();
    ui.fireEvent.press('ArrowRight');
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    expect(readout(ui, /^focus is on /)).toBe('focus is on the stepper');
    expect(ui.getByText('steps: 2')).toBeDefined();

    ui.fireEvent.press('ArrowLeft');
    ui.frame();
    expect(ui.getByText('steps: 1')).toBeDefined();
    expect(readout(ui, /^last key: /)).toBe('last key: ArrowLeft');
  });
});

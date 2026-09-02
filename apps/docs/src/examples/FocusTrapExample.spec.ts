import { describe, expect, it } from 'vitest';

import type { LayoutBox, UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { FocusTrapSurface } from './FocusTrapExample';

const SIZE = { width: 460, height: 340 };

function surface(): Rendered {
  return renderTest(createComponent(FocusTrapSurface, {}), SIZE);
}

/** The middle of a node's box, in the coordinates a pointer arrives in. */
function centreOf(ui: Rendered, node: UiNode): { x: number; y: number } {
  const box: LayoutBox = ui.getLayout(node);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/**
 * A whole press on a button, through the hit tester.
 *
 * The coordinate path rather than `click(node)`, because focus on press
 * is what records the control a trap will restore to, and a click
 * dispatched straight at the node never moves focus at all.
 */
function pressButton(ui: Rendered, name: string): void {
  const point = centreOf(ui, ui.getByRole('button', { name }));
  ui.fireEvent.pointerDown(point.x, point.y);
  ui.fireEvent.pointerUp(point.x, point.y);
  ui.frame();
}

/** What one of the readout lines currently says. */
function readout(ui: Rendered, prefix: RegExp): string {
  return String(ui.getByText(prefix).getProperty('text'));
}

/** Who holds focus, by the accessible name the readout prints. */
function focused(ui: Rendered): string {
  return readout(ui, /^focus is on /).replace('focus is on ', '');
}

/**
 * The page's claim, measured: a trap confines Tab to its subtree,
 * refuses focus from outside it, and hands the keyboard back to the
 * control that opened it.
 *
 * Tab goes through the focus manager and the presses go through the hit
 * tester, so nothing here would pass while the dialog was unreachable.
 */
describe('the docs focus trap example', () => {
  it('opens with the caret in the autofocused field, not on the first stop', () => {
    const ui = surface();
    expect(focused(ui)).toBe('nothing');

    pressButton(ui, 'Rename');

    // The trap was taken from a ref, before the panel had children, and
    // the runtime settled focus into it on the same frame. `autoFocus`
    // then chose the field over the scope's first focusable.
    expect(focused(ui)).toBe('Note name');
    expect(readout(ui, /^the keyboard /)).toBe('the keyboard is trapped');
  });

  it('wraps Tab inside the dialog and never reaches the page behind it', () => {
    const ui = surface();
    pressButton(ui, 'Rename');

    const visited: string[] = [];
    for (let step = 0; step < 4; step++) {
      ui.fireEvent.tab();
      ui.frame();
      visited.push(focused(ui));
    }

    expect(visited).toEqual(['Save', 'Cancel', 'Note name', 'Save']);
    expect(visited).not.toContain('Rename');
    expect(visited).not.toContain('Elsewhere');
  });

  it('refuses focus asked for from outside the trap', () => {
    const ui = surface();
    pressButton(ui, 'Rename');

    const outside = ui.getByRole('button', { name: 'Elsewhere' });
    expect(ui.fireEvent.focus(outside)).toBe(false);
    ui.frame();
    expect(focused(ui)).toBe('Note name');
  });

  it('rings whatever holds focus, and only that', () => {
    const ui = surface();
    pressButton(ui, 'Rename');
    const save = ui.getByRole('button', { name: 'Save' });
    expect(save.decorations).toBeNull();

    ui.fireEvent.tab();
    ui.frame();

    expect(focused(ui)).toBe('Save');
    expect(save.decorations).not.toBeNull();
  });

  it('returns focus to the control that opened it', () => {
    const ui = surface();
    pressButton(ui, 'Rename');
    expect(focused(ui)).toBe('Note name');

    // Pressing Cancel focuses Cancel on the way in, and releasing the
    // trap restores the node that held focus when it was taken.
    pressButton(ui, 'Cancel');

    expect(focused(ui)).toBe('Rename');
    expect(readout(ui, /^the keyboard /)).toBe('the keyboard is free');

    // And the page's own stops are reachable again.
    ui.fireEvent.tab();
    ui.frame();
    expect(focused(ui)).toBe('Elsewhere');
  });
});

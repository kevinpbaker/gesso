import { describe, expect, it } from 'vitest';

import { noKeyModifiers, type UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { InputExampleApp } from './InputExampleApp';

const SIZE = { width: 1200, height: 800 };

/** The middle of a node's box, in the coordinates a pointer arrives in. */
function centreOf(ui: Rendered, node: UiNode): { x: number; y: number } {
  const box = ui.getLayout(node);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** The first seven rows of the list, top to bottom. */
function orderOf(ui: Rendered): string[] {
  return ['01', '02', '03', '04', '05', '06', '07', '08']
    .map(suffix => ui.getByRole('listitem', { name: `Row ${suffix}` }))
    .map(node => ({ name: String(node.properties.get('label')), y: ui.getLayout(node).y }))
    .sort((a, b) => a.y - b.y)
    .slice(0, 7)
    .map(entry => entry.name);
}

function page(): Rendered {
  return renderTest(createComponent(InputExampleApp, {}), SIZE);
}

/** A key press through the runtime's own keyboard controller. */
function press(ui: Rendered, key: string, modifiers: Partial<ReturnType<typeof noKeyModifiers>> = {}): void {
  ui.runtime.input.keyboard.keyDown(key, { ...noKeyModifiers(), ...modifiers });
  ui.frame();
}

/**
 * The gestures example, driven through a real runtime.
 *
 * Everything here goes in at the runtime's own entry points — a key
 * arrives at `input.keyboard`, a press at `input.pointer` — so the
 * keyboard controller, the dispatcher, the modifier hosts and the
 * registry are all in the path. A spec that called `registry.handleKey`
 * would be asserting the registry twice and the wiring never, which is
 * the defect `decisions/0025-structure-tier.md` records.
 */
describe('the gestures example', () => {
  it('opens the palette on the application shortcut', () => {
    const ui = page();
    expect(ui.queryByText('Every shortcut that is live')).toBeNull();

    press(ui, 'k', { ctrl: true });

    expect(ui.getByText('Every shortcut that is live')).not.toBeNull();
  });

  it('lists the commands of the route it is on, and only those', () => {
    const ui = page();
    press(ui, 'k', { ctrl: true });

    // The photo's own command is live because the photo is on screen.
    expect(ui.getByText('Let a pinch rotate the photo')).not.toBeNull();
    expect(ui.queryByText('Remove the chosen row')).toBeNull();

    // Walk to the board with the chord, and the list changes with it:
    // the photo's shortcut went away with the pane that registered it.
    press(ui, 'g');
    press(ui, 'b');
    press(ui, 'k', { ctrl: true });

    expect(ui.queryByText('Let a pinch rotate the photo')).toBeNull();
    expect(ui.queryByText('Forget the dropped files')).toBeNull();
  });

  it('lists a scoped command only while focus is inside its scope', () => {
    const ui = page();
    press(ui, 'g');
    press(ui, 'b');
    const row = ui.getByRole('listitem', { name: 'Row 03' });
    // Chosen, so the command's own condition is satisfied and only the
    // scope is left to decide.
    ui.fireEvent.click(row);
    ui.frame();

    press(ui, 'k', { ctrl: true });
    expect(ui.queryByText('Remove the chosen row')).toBeNull();

    ui.runtime.input.focus.focus(row);
    ui.frame();
    expect(ui.getByText('Remove the chosen row')).not.toBeNull();
  });

  it('moves a chip into the tray it is dropped on', () => {
    const ui = page();
    press(ui, 'g');
    press(ui, 'b');

    const chip = centreOf(ui, ui.getByText('Ledger'));
    const done = centreOf(ui, ui.getByText('Done'));
    ui.fireEvent.pointerDown(chip.x, chip.y);
    ui.fireEvent.pointerMove(done.x, done.y);
    ui.fireEvent.pointerUp(done.x, done.y);
    ui.frame();

    expect(ui.getByText('Ledger moved to Done.')).not.toBeNull();
  });

  it('reorders a row as the carried row crosses it', () => {
    const ui = page();
    press(ui, 'g');
    press(ui, 'b');

    const first = ui.getByRole('listitem', { name: 'Row 01' });
    const third = ui.getByRole('listitem', { name: 'Row 03' });
    const from = centreOf(ui, first);
    const to = centreOf(ui, third);

    ui.fireEvent.pointerDown(from.x, from.y);
    ui.fireEvent.pointerMove(from.x, from.y + 20);
    ui.frame();
    ui.fireEvent.pointerMove(to.x, to.y);
    ui.frame();
    ui.fireEvent.pointerUp(to.x, to.y);
    ui.frame();

    // The carried row is where the third row was, which is the reorder
    // the drop-target session worked out from the boxes.
    expect(orderOf(ui)).toEqual(['Row 02', 'Row 03', 'Row 01', 'Row 04', 'Row 05', 'Row 06', 'Row 07']);
  });

  it('opens a menu on the secondary button', () => {
    const ui = page();
    press(ui, 'g');
    press(ui, 'b');
    expect(ui.queryByText('Move to the top')).toBeNull();

    const row = centreOf(ui, ui.getByRole('listitem', { name: 'Row 02' }));
    ui.fireEvent.pointerDown(row.x, row.y, { buttons: 2 });
    ui.frame();

    expect(ui.getByText('Move to the top')).not.toBeNull();
    expect(ui.getByText('Choose this row')).not.toBeNull();
  });

  it('walks between panes with a chord', () => {
    const ui = page();
    press(ui, 'g');
    press(ui, 'b');

    expect(ui.getByText('Carry a row. Hold it at the bottom edge and the list scrolls.')).not.toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import type { UiSemanticsUpdate } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Note } from './MirrorExample';

// #region mount
/**
 * Mounts the note with a listener where the shell attaches its mirror.
 *
 * `onSemantics` is the seam: `GessoApp` hands each update straight to
 * a `SemanticsMirror`, and `WorkerApp` posts it across the thread to
 * one. A spec standing in that place sees exactly what the mirror is
 * given, and `applySemanticsAction` is exactly what the mirror sends
 * back when an assistive technology acts on an element.
 */
function mount() {
  const updates: UiSemanticsUpdate[] = [];
  const ui = renderTest(createComponent(Note, {}), {
    width: 420,
    height: 260,
    onCreate: runtime => runtime.onSemantics(update => updates.push(update))
  });
  return { ui, updates };
}
// #endregion mount

describe('the docs mirror example', () => {
  // #region update
  it('sends the records, a box for each of them, and nothing about focus', () => {
    const { updates } = mount();

    expect(updates).toHaveLength(1);
    const first = updates[0];
    expect(first.patches.map(patch => (patch.op === 'add' ? patch.node.role : null))).toEqual([
      undefined,
      'textbox',
      'button',
      undefined
    ]);
    // One box per record, in canvas pixels: the records themselves
    // carry no geometry, so this is how an element ends up over the
    // node it stands for.
    expect(first.boxes).toHaveLength(first.patches.length);
    expect(first.boxes.every(entry => entry.box.width > 0)).toBe(true);
    // Nothing has focus and nothing had it before, so the update says
    // nothing rather than saying "null".
    expect(first.focused).toBeUndefined();
  });
  // #endregion update

  it('sends only the boxes that moved on a later frame', () => {
    const { ui, updates } = mount();

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    // The status line grew, and the two controls above it did not
    // move, so one record's box is worth sending.
    const last = updates.at(-1)!;
    expect(last.boxes.length).toBeLessThan(updates[0].boxes.length);
  });

  // #region actions
  it('turns a press on a mirrored element back into an ordinary press', () => {
    const { ui } = mount();
    const button = ui.getSemantics(ui.getByRole('button'));

    // What the mirror sends when an assistive technology invokes an
    // element: an id and an action, never a coordinate.
    ui.runtime.applySemanticsAction({ id: button.id, action: 'click' });
    ui.frame();

    expect(ui.getByText('Filed 1, most recently Groceries')).toBeDefined();
  });

  it('turns a value set on a mirrored field into an edit the app sees', () => {
    const { ui } = mount();
    const field = ui.getSemantics(ui.getByRole('textbox'));
    expect(field.valueText).toBe('Groceries');

    ui.runtime.applySemanticsAction({ id: field.id, action: 'setValue', value: 'Invoices' });
    ui.frame();

    expect(ui.getSemantics(ui.getByRole('textbox')).valueText).toBe('Invoices');
    expect(ui.getByText('Nothing filed yet')).toBeDefined();
  });

  it('moves the application focus for a focus action, and reports where it went', () => {
    const { ui, updates } = mount();
    const button = ui.getSemantics(ui.getByRole('button'));

    ui.runtime.applySemanticsAction({ id: button.id, action: 'focus' });
    ui.frame();

    expect(ui.runtime.input.focus.focusedNode?.id).toBe(button.id);
    expect(updates.at(-1)?.focused).toBe(button.id);
  });
  // #endregion actions

  it('refuses an id that has left the tree', () => {
    const { ui } = mount();
    const button = ui.getSemantics(ui.getByRole('button'));
    ui.runtime.applySemanticsAction({ id: button.id, action: 'focus' });

    ui.runtime.applySemanticsAction({ id: 'no-such-node', action: 'focus' });

    expect(ui.runtime.input.focus.focusedNode?.id).toBe(button.id);
  });
});

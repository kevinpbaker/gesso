import { describe, expect, it } from 'vitest';

import type { UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { NameField } from './EditingExample';

const SIZE = { width: 460, height: 300 };

function editor(): { ui: Rendered; field: UiNode } {
  const ui = renderTest(createComponent(NameField, {}), SIZE);
  const field = ui.getByRole('textbox', { name: 'Name' });
  ui.fireEvent.focus(field);
  return { ui, field };
}

/** A whole press at a point, through the hit tester. */
function pressAt(ui: Rendered, x: number, y: number): void {
  ui.fireEvent.pointerDown(x, y);
  ui.fireEvent.pointerUp(x, y);
}

/** What one of the readout lines currently says. */
function readout(ui: Rendered, prefix: RegExp): string {
  return String(ui.getByText(prefix).getProperty('text'));
}

/**
 * The claims the page makes about a bare editable, measured through the
 * paths a real caret takes: presses go through the hit tester at real
 * coordinates, keys through the keyboard controller, and the
 * composition through the same controller methods a shell's hidden
 * textarea calls when an IME reports one.
 */
describe('the docs editing example', () => {
  it('announces itself as a textbox whose value is its text', () => {
    const { ui, field } = editor();

    expect(field).toHaveSemantics({ role: 'textbox', name: 'Name' });
    // An editable's content is its value, not its name.
    expect(ui.getSemantics(field).valueText).toBe('Ada Lovelace');
  });

  it('reports every edit with the value and the selection after it', () => {
    const { ui, field } = editor();

    ui.fireEvent.press('End');
    ui.fireEvent.type('!');
    ui.frame();

    expect(readout(ui, /^value: /)).toBe('value: Ada Lovelace!');
    // The caret follows the insertion, and a caret is an empty range.
    expect(readout(ui, /^selection: /)).toBe('selection: 13 to 13');
    expect(ui.getSemantics(field).valueText).toBe('Ada Lovelace!');
  });

  it('lets onBeforeInput refuse an edit before it reaches the text', () => {
    const { ui, field } = editor();

    ui.fireEvent.press('End');
    ui.fireEvent.type('1815');
    ui.frame();

    expect(readout(ui, /^value: /)).toBe('value: Ada Lovelace');
    expect(readout(ui, /^refused: /)).toBe('refused: 1 edit');
    // Cancelled means the model never saw it, so what an assistive
    // technology reads did not move either.
    expect(ui.getSemantics(field).valueText).toBe('Ada Lovelace');

    // A paste is the same kind of edit, and meets the same rule.
    ui.fireEvent.paste('1843');
    ui.frame();
    expect(readout(ui, /^value: /)).toBe('value: Ada Lovelace');
    expect(readout(ui, /^refused: /)).toBe('refused: 2 edits');

    // The rule is about the text, not about typing: letters still land.
    ui.fireEvent.paste(' ODE');
    ui.frame();
    expect(readout(ui, /^value: /)).toBe('value: Ada Lovelace ODE');
  });

  it('places the caret where the press landed', () => {
    const { ui, field } = editor();
    const box = ui.getLayout(field);
    const middle = Math.round(box.y + box.height / 2);

    // Past the end of the text: the offset nearest the point is the
    // end of the line.
    pressAt(ui, Math.round(box.x + box.width - 2), middle);
    ui.fireEvent.type('!');
    ui.frame();
    expect(readout(ui, /^value: /)).toBe('value: Ada Lovelace!');

    // Before the first glyph: the offset nearest the point is zero.
    pressAt(ui, Math.round(box.x + 1), middle);
    ui.fireEvent.type('>');
    ui.frame();
    expect(readout(ui, /^value: /)).toBe('value: >Ada Lovelace!');
  });

  it('selects a word on the second press, and typing replaces it', () => {
    const { ui, field } = editor();
    const box = ui.getLayout(field);
    const middle = Math.round(box.y + box.height / 2);
    const inFirstWord = Math.round(box.x + 1);

    pressAt(ui, inFirstWord, middle);
    pressAt(ui, inFirstWord, middle);
    ui.fireEvent.type('Grace');
    ui.frame();

    // The word went, not the line and not one grapheme.
    expect(readout(ui, /^value: /)).toBe('value: Grace Lovelace');
  });

  it('shows a composition while it is open and commits it as one undo step', () => {
    const { ui, field } = editor();
    const editing = ui.runtime.input.editing;

    ui.fireEvent.press('End');
    ui.fireEvent.type(' ');
    ui.frame();

    // What a shell's hidden textarea reports as an IME builds a word.
    editing.compositionStart();
    editing.compositionUpdate('にほn', 3);
    ui.frame();

    // Nothing has been committed, so the application has not been told
    // anything; the composing text is in the node's model, which is
    // what the shell mirrors so the candidate window sits at the caret.
    expect(readout(ui, /^value: /)).toBe('value: Ada Lovelace ');
    const composing = editing.state();
    expect(composing?.composing).toBe(true);
    expect(composing?.text).toBe('Ada Lovelace にほn');

    editing.compositionEnd('日本');
    ui.frame();

    expect(readout(ui, /^value: /)).toBe('value: Ada Lovelace 日本');
    expect(editing.state()?.composing).toBe(false);
    expect(ui.getSemantics(field).valueText).toBe('Ada Lovelace 日本');

    // One undo entry for the whole composition, and the space typed
    // before it is still there.
    ui.fireEvent.press('z', { ctrl: true });
    ui.frame();
    expect(readout(ui, /^value: /)).toBe('value: Ada Lovelace ');
  });
});

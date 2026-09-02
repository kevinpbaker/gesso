import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { NoteList } from './RecipeDialogExample';

const SIZE = { width: 460, height: 360 };

const mount = () => renderTest(createComponent(NoteList, {}), SIZE);

/** The accessible name of whatever holds the keyboard. */
const focused = (ui: Rendered): string =>
  String(ui.runtime.input.focus.focusedNode?.properties.get('label') ?? 'nothing');

/** The titles in the list, in order. */
const titles = (ui: Rendered): string[] =>
  ui.getAllByRole('listitem').map(node => String(ui.getSemantics(node).label ?? ''));

/** Tabs to the first row's Delete button and presses Enter on it. */
function askToDelete(ui: Rendered): UiNode {
  ui.fireEvent.tab();
  const opener = ui.runtime.input.focus.focusedNode as UiNode;
  ui.fireEvent.keyDown('Enter');
  ui.frame();
  return opener;
}

/**
 * The page claims a flow, so the spec drives the flow, and drives it
 * with the keyboard alone: no click anywhere in this file. Opening
 * confirms, the trap holds, cancelling gives the keyboard back to the
 * row, confirming moves it to the undo, and the undo window closing
 * is what makes the deletion permanent.
 */
describe('the docs dialog flow recipe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the notes, and names each row button by what it deletes', () => {
    const ui = mount();

    expect(titles(ui)).toEqual(['Quarterly report', 'Reading list', 'Interview notes']);
    expect(ui.getByRole('button', { name: 'Delete Quarterly report' })).toBeDefined();
    expect(ui.getByRole('button', { name: 'Delete Reading list' })).toBeDefined();
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(ui.getByText('Nothing has been deleted.')).toBeDefined();
  });

  it('opens the dialog from the row, and traps the keyboard in it', () => {
    const ui = mount();
    const opener = askToDelete(ui);

    expect(String(opener.properties.get('label'))).toBe('Delete Quarterly report');
    expect(ui.getByRole('dialog')).toHaveSemantics({ role: 'dialog', name: 'Delete this note?' });
    expect(ui.getSemantics(ui.getByRole('dialog')).description).toBe(
      '"Quarterly report" leaves the list. You can take it back once.'
    );
    expect(ui.runtime.input.focus.trapped).toBe(true);

    // Tab walks the dialog's own two buttons and wraps, so the rows
    // underneath are unreachable while it is up.
    const seen = [focused(ui)];
    ui.fireEvent.keyDown('Tab');
    seen.push(focused(ui));
    ui.fireEvent.keyDown('Tab');
    seen.push(focused(ui));
    expect(seen).toEqual(['Keep it', 'Delete', 'Keep it']);
  });

  it('gives the keyboard back to the row when the answer is no', () => {
    const ui = mount();
    const opener = askToDelete(ui);

    // Enter on the focused Keep it button: the dialog's content binds
    // its own keys, like anything hand-written.
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(ui.queryByRole('dialog')).toBeNull();
    expect(ui.runtime.input.focus.trapped).toBe(false);
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);
    expect(titles(ui)).toHaveLength(3);
    expect(ui.queryByRole('status')).toBeNull();
  });

  it('closes on Escape too, and can be opened again', () => {
    const ui = mount();
    const opener = askToDelete(ui);

    ui.fireEvent.keyDown('Escape');
    ui.frame();

    expect(ui.queryByRole('dialog')).toBeNull();
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);

    // Escape reports the close once, and reopening is what proves the
    // handler left nothing behind either way.
    ui.fireEvent.keyDown('Enter');
    ui.frame();
    expect(ui.getByRole('dialog')).toBeDefined();
    expect(titles(ui)).toHaveLength(3);
  });

  it('deletes on confirm, announces it, and puts the keyboard on the undo', () => {
    const ui = mount();
    askToDelete(ui);

    ui.fireEvent.keyDown('Tab');
    expect(focused(ui)).toBe('Delete');
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    expect(ui.queryByRole('dialog')).toBeNull();
    expect(titles(ui)).toEqual(['Reading list', 'Interview notes']);

    // The notice waits its turn rather than interrupting, and takes no
    // focus of its own.
    expect(ui.getByRole('status')).toHaveSemantics({ role: 'status', name: 'Deleted "Quarterly report"' });

    // The button that opened the dialog left with its row, so the trap
    // had nothing to restore to. The undo button says it takes the
    // caret, and it is the only thing on the screen that does.
    expect(ui.runtime.input.focus.trapped).toBe(false);
    expect(focused(ui)).toBe('Undo deleting Quarterly report');
  });

  it('takes the deletion back with the key the reader just pressed', () => {
    const ui = mount();
    askToDelete(ui);
    ui.fireEvent.keyDown('Tab');
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    ui.fireEvent.keyDown('Enter');
    ui.frame();

    // Back where it was, not appended: the index went into the cell
    // with the note.
    expect(titles(ui)).toEqual(['Quarterly report', 'Reading list', 'Interview notes']);
    expect(ui.queryByRole('status')).toBeNull();
    expect(ui.queryByRole('button', { name: 'Undo deleting Quarterly report' })).toBeNull();
    expect(ui.getByText('Nothing has been deleted.')).toBeDefined();
  });

  it('makes the deletion permanent when the undo window closes', () => {
    const ui = mount();
    askToDelete(ui);
    ui.fireEvent.keyDown('Tab');
    ui.fireEvent.keyDown('Enter');
    ui.frame();

    vi.advanceTimersByTime(4000);
    ui.frame();

    expect(ui.queryByRole('status')).toBeNull();
    expect(ui.queryByRole('button', { name: 'Undo deleting Quarterly report' })).toBeNull();
    expect(titles(ui)).toEqual(['Reading list', 'Interview notes']);
    expect(ui.getByText('Nothing has been deleted.')).toBeDefined();
  });
});

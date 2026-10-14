import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { editorFor } from '../editing/UiEditable';
import { InputTestHarness } from './UiInputTestUtils';
import { noKeyModifiers, UiEventType, type UiTextChangeEvent } from './UiInputEvent';

/**
 * A secret field, edited as a password input is: the value is the
 * person's and the application's, and nothing else gets it. Not the
 * shell's mirror, not the clipboard, and not the caret stopping at
 * the ends of words.
 */
describe('UiEditingController with a secret field', () => {
  function field(value = 'hunter 2', props: Record<string, unknown> = {}) {
    const h = new InputTestHarness();
    const node = h.node('field', UiNodeType.EditableText, { value, focusable: true, secret: true, ...props });
    h.add(h.root, node);
    h.layoutTree();
    const focus = h.createFocusManager();
    const editing = h.createEditingController(focus);
    focus.focus(node);
    const model = editorFor(node);
    const inputs: string[] = [];
    h.dispatcher.addEventListener(node, UiEventType.Input, event => {
      inputs.push((event as UiTextChangeEvent).value);
    });
    return { h, node, editing, model, inputs };
  }

  it('hands the shell the mask and says it is secret, with nothing to copy', () => {
    const { editing, model } = field();
    model.select(2, 6);
    const state = editing.state()!;
    expect(state.text).toBe('••••••••');
    expect([state.selectionStart, state.selectionEnd]).toEqual([2, 6]);
    expect(state.secret).toBe(true);
    expect(state.clipboard).toBe('');
    expect(state.html).toBeUndefined();
  });

  it('keeps the real text in the model, and reports it', () => {
    const { editing, model, inputs } = field('abc');
    model.select(3);
    editing.beforeInput('insertText', 'd');
    expect(model.text).toBe('abcd');
    expect(inputs).toEqual(['abcd']);
  });

  it('refuses a cut: what the clipboard did not get is not deleted', () => {
    const { editing, model, inputs } = field();
    model.select(0, 6);
    expect(editing.beforeInput('deleteByCut', null)).toBe(true);
    expect(model.text).toBe('hunter 2');
    expect(inputs).toEqual([]);
  });

  it('still takes a paste, on one line', () => {
    const { editing, model } = field('');
    editing.paste('pass\nword');
    expect(model.text).toBe('pass word');
  });

  it('moves and deletes by word over the whole text, so the caret shows no word boundary', () => {
    const { editing, model, node } = field();
    model.select(0);
    // Ctrl and an arrow is a word on the platform the specs detect.
    editing.handleKey(node, 'ArrowRight', { ...noKeyModifiers(), ctrl: true }, true);
    // A field without `secret` stops after 'hunter'.
    expect(model.focus).toBe(8);
    editing.beforeInput('deleteWordBackward', null);
    expect(model.text).toBe('');
  });

  it('selects everything on a double click rather than a word', () => {
    const { editing, model, node } = field();
    editing.pointerDown(node, 10, 10, noKeyModifiers());
    editing.pointerUp();
    editing.pointerDown(node, 10, 10, noKeyModifiers());
    expect([model.start, model.end]).toEqual([0, 8]);
  });

  it('is one line whatever `multiline` says', () => {
    const { editing, model } = field('a', { multiline: true });
    model.select(1);
    expect(editing.beforeInput('insertLineBreak', null)).toBe(false);
    expect(model.text).toBe('a');
    expect(editing.state()!.multiline).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { editorFor } from '../editing/UiEditable';
import { InputTestHarness } from './UiInputTestUtils';
import { UiEventType, type UiPasteEvent } from './UiInputEvent';

/**
 * A paste with nothing editable focused.
 *
 * The case a spreadsheet falls into, and the one `paste` used to drop:
 * a caret in a field means the text belongs to the field, but a
 * surface that owns a selection of its own — a grid with a rectangle
 * of cells picked out — is the only thing that knows what a block of
 * tab-separated text means, and it had no way to hear about one.
 */
describe('UiEditingController.paste with no editable focused', () => {
  function harnessWith(type: UiNodeType, props: Record<string, unknown>) {
    const h = new InputTestHarness();
    const node = h.node('target', type, props);
    h.add(h.root, node);
    h.layoutTree();
    const focus = h.createFocusManager();
    const editing = h.createEditingController(focus);
    focus.focus(node);
    return { h, node, editing };
  }

  it('offers the text to whatever does have focus', () => {
    const { h, node, editing } = harnessWith(UiNodeType.Box, { focusable: true });
    const seen: string[] = [];
    h.dispatcher.addEventListener(node, UiEventType.Paste, event => {
      seen.push((event as UiPasteEvent).text);
      event.preventDefault();
    });

    expect(editing.paste('a\tb\nc\td')).toBe(true);
    expect(seen).toEqual(['a\tb\nc\td']);
  });

  /** Unhandled is reported, so a shell can fall back to its own default. */
  it('reports it unhandled when nobody takes it', () => {
    const { editing } = harnessWith(UiNodeType.Box, { focusable: true });
    expect(editing.paste('x')).toBe(false);
  });

  it('reports it unhandled when nothing at all has focus', () => {
    const h = new InputTestHarness();
    h.layoutTree();
    expect(h.createEditingController().paste('x')).toBe(false);
  });

  /** A caret in a field still wins: the text is the text's. */
  it('goes into the text when a caret is in it, and fires no event', () => {
    const { h, node, editing } = harnessWith(UiNodeType.EditableText, { value: '' });
    const seen: string[] = [];
    h.dispatcher.addEventListener(node, UiEventType.Paste, () => seen.push('event'));

    expect(editing.paste('hello')).toBe(true);
    expect(editorFor(node).text).toBe('hello');
    expect(seen).toEqual([]);
  });

  it('bubbles, so a grid can listen above its cells', () => {
    const h = new InputTestHarness();
    const grid = h.node('grid', UiNodeType.Box, { focusable: true });
    const cell = h.node('cell', UiNodeType.Box, { focusable: true });
    h.add(grid, cell);
    h.add(h.root, grid);
    h.layoutTree();
    const focus = h.createFocusManager();
    const editing = h.createEditingController(focus);
    focus.focus(cell);

    const seen: string[] = [];
    h.dispatcher.addEventListener(grid, UiEventType.Paste, event => {
      seen.push('grid');
      event.preventDefault();
    });

    expect(editing.paste('x')).toBe(true);
    expect(seen).toEqual(['grid']);
  });
});

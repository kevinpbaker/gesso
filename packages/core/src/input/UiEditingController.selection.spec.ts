import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { editorFor } from '../editing/UiEditable';
import { InputTestHarness } from './UiInputTestUtils';
import { UiEventType, type UiSelectionChangeEvent } from './UiInputEvent';
import { noKeyModifiers } from './UiInputEvent';

/**
 * The caret moving, reported.
 *
 * `onInput` says the text changed and nothing else. The caret moves
 * without the text on every arrow key, every click into the text and
 * every select-all, and anything that decorates by caret position —
 * a bracket matched against the one beside it, a hint about which
 * argument is being typed — had no way to hear about any of them.
 */
describe('UiEditingController selection reporting', () => {
  function field(value = 'abcdef') {
    const h = new InputTestHarness();
    const node = h.node('field', UiNodeType.EditableText, { value, focusable: true });
    h.add(h.root, node);
    h.layoutTree();
    const focus = h.createFocusManager();
    const editing = h.createEditingController(focus);
    focus.focus(node);
    const model = editorFor(node);
    const seen: { start: number; end: number; value: string; collapsed: boolean }[] = [];
    h.dispatcher.addEventListener(node, UiEventType.SelectionChange, event => {
      const moved = event as UiSelectionChangeEvent;
      seen.push({ start: moved.start, end: moved.end, value: moved.value, collapsed: moved.collapsed });
    });
    return { h, node, editing, model, seen };
  }

  const right = (h: ReturnType<typeof field>) => h.editing.handleKey(h.node, 'ArrowRight', noKeyModifiers());

  it('reports an arrow key, which changes no text at all', () => {
    const h = field();
    h.model.select(0);
    h.seen.length = 0;

    right(h);
    expect(h.seen).toEqual([{ start: 1, end: 1, value: 'abcdef', collapsed: true }]);
  });

  /**
   * The guard that keeps it quiet: a move that moves nothing.
   *
   * Driven to the end with a key rather than by `select`, because a
   * programmatic move happens behind the controller's back — it has
   * not reported that position yet, so the next key legitimately
   * does. What must be silent is a key that changes nothing the
   * controller has already said.
   */
  it('says nothing when the caret is already at the end', () => {
    const h = field();
    h.model.select(5);
    right(h);
    expect(h.seen).toHaveLength(1);

    h.seen.length = 0;
    right(h);
    right(h);
    expect(h.seen).toEqual([]);
  });

  it('reports a selection that was extended, not just a caret', () => {
    const h = field();
    h.model.select(0);
    h.seen.length = 0;

    h.editing.handleKey(h.node, 'ArrowRight', { ...noKeyModifiers(), shift: true });
    expect(h.seen).toEqual([{ start: 0, end: 1, value: 'abcdef', collapsed: false }]);
  });

  it('carries which end is the anchor and which the caret', () => {
    const h = field();
    h.model.select(3);
    h.seen.length = 0;
    let last: UiSelectionChangeEvent | undefined;
    h.h.dispatcher.addEventListener(h.node, UiEventType.SelectionChange, event => {
      last = event as UiSelectionChangeEvent;
    });

    h.editing.handleKey(h.node, 'ArrowLeft', { ...noKeyModifiers(), shift: true });
    expect(last?.anchor).toBe(3);
    expect(last?.focus).toBe(2);
  });

  /** Typing moves the caret too, and both events fire in order. */
  it('reports a text change as well, after the input', () => {
    const h = field('');
    const order: string[] = [];
    h.h.dispatcher.addEventListener(h.node, UiEventType.Input, () => order.push('input'));
    h.h.dispatcher.addEventListener(h.node, UiEventType.SelectionChange, () => order.push('selection'));

    h.editing.insertText('x');
    expect(order).toEqual(['input', 'selection']);
  });

  /**
   * The value travels with the offsets. Reading the text back off the
   * model afterwards is a second source of truth that can disagree by
   * a frame, and every use of this is "what is under the caret".
   */
  it('carries the text the offsets are into', () => {
    const h = field('');
    h.seen.length = 0;
    h.editing.insertText('ab');
    expect(h.seen.at(-1)).toEqual({ start: 2, end: 2, value: 'ab', collapsed: true });
  });

  it('costs nothing when nobody is listening', () => {
    const h = new InputTestHarness();
    const node = h.node('field', UiNodeType.EditableText, { value: 'abc', focusable: true });
    h.add(h.root, node);
    h.layoutTree();
    const focus = h.createFocusManager();
    const editing = h.createEditingController(focus);
    focus.focus(node);
    // No listener at all: the dispatch is skipped by `hasListeners`,
    // and the only thing this must not do is throw.
    expect(() => editing.handleKey(node, 'ArrowRight', noKeyModifiers())).not.toThrow();
  });
});

/**
 * Where the caret is, which an application cannot work out.
 *
 * The geometry needs the paragraph as it was laid out — the
 * measurer, the resolved paint, the layout record — so an application
 * that re-measured the text to place a popup under the caret would be
 * a second measurer that must never disagree with this one.
 *
 * The harness measures a fixed width per character, so the caret's x
 * is a multiple of it and these are exact rather than approximate.
 */
describe('UiEditingController.caretRectOf', () => {
  function laidOut(value: string) {
    const h = new InputTestHarness();
    const node = h.node('field', UiNodeType.EditableText, { value, focusable: true, width: 200, height: 24 });
    h.add(h.root, node);
    h.layoutTree();
    const focus = h.createFocusManager();
    const editing = h.createEditingController(focus);
    focus.focus(node);
    return { h, node, editing, model: editorFor(node) };
  }

  it('moves along the line as the caret does', () => {
    const h = laidOut('abcdef');
    h.model.select(0);
    const atStart = h.editing.caretRectOf(h.node);
    h.model.select(3);
    const later = h.editing.caretRectOf(h.node);

    expect(atStart).not.toBeNull();
    expect(later!.x).toBeGreaterThan(atStart!.x);
  });

  it('is as tall as a line, and says which line it is on', () => {
    const h = laidOut('abc');
    const caret = h.editing.caretRectOf(h.node)!;
    expect(caret.height).toBeGreaterThan(0);
    expect(caret.line).toBe(0);
  });

  it('says nothing for a node that is not a field', () => {
    const h = new InputTestHarness();
    const box = h.node('box', UiNodeType.Box, { focusable: true });
    h.add(h.root, box);
    h.layoutTree();
    const editing = h.createEditingController(h.createFocusManager());
    expect(editing.caretRectOf(box)).toBeNull();
  });

  /** The frame a field first appears in, which is not an error. */
  it('says nothing for a field that has not been laid out', () => {
    const h = new InputTestHarness();
    const node = h.node('field', UiNodeType.EditableText, { value: 'abc', focusable: true });
    const editing = h.createEditingController(h.createFocusManager());
    expect(editing.caretRectOf(node)).toBeNull();
  });
});

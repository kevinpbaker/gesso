import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Button, Column, EditableText, ScrollView, Text } from '../../ui/composition/UiComponents';
import type { UiElement } from '../../ui/composition/UiElement';
import { editorOf } from '../../ui/editing/UiEditable';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import { noKeyModifiers, type UiKeyModifiers, type UiTextChangeEvent } from '../../ui/input/UiInputEvent';
import type { EditingState } from '../../ui/input/UiEditingController';
import type { CanvasHost } from '../../ui/rendering';
import { UiManualFrameClock } from '../../ui/scheduler';
import { NodalRuntime } from './NodalRuntime';

/** 7px per character, so caret x is 7 × offset in the default 14px font. */
function mockCanvas(): CanvasHost {
  const ctx: Record<string, unknown> = {};
  for (const m of [
    'save',
    'restore',
    'translate',
    'scale',
    'rotate',
    'setTransform',
    'clearRect',
    'fillRect',
    'strokeRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'arcTo',
    'closePath',
    'rect',
    'clip',
    'fill',
    'stroke',
    'fillText',
    'drawImage'
  ])
    ctx[m] = vi.fn();
  ctx.measureText = vi.fn((t: string) => ({ width: String(t).length * 7 }));
  Object.assign(ctx, {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '14px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic'
  });
  return { width: 800, height: 600, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

const mods = (partial: Partial<UiKeyModifiers>): UiKeyModifiers => ({ ...noKeyModifiers(), ...partial });

function mount(root: UiElement) {
  let clock!: UiManualFrameClock;
  const states: (EditingState | null)[] = [];
  const runtime = new NodalRuntime({
    root,
    canvas: mockCanvas(),
    width: 800,
    height: 600,
    clock: cb => (clock = new UiManualFrameClock(cb))
  });
  runtime.onEditingState(state => states.push(state));
  runtime.start();
  const tick = (): void => {
    if (clock.isPending) {
      clock.tick(16);
    }
  };
  tick();
  const find = (type: UiNodeType, from: UiNode = runtime.debugRoot()): UiNode => {
    const visit = (node: UiNode): UiNode | null => {
      if (node.type === type) {
        return node;
      }
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        const found = visit(child);
        if (found !== null) {
          return found;
        }
      }
      return null;
    };
    const found = visit(from);
    if (found === null) {
      throw new Error(`No ${type} node.`);
    }
    return found;
  };
  const field = find(UiNodeType.EditableText);
  const model = () => editorOf(field)!;
  const type = (text: string): void => {
    for (const character of text) {
      runtime.input.keyboard.keyDown(character);
      runtime.input.keyboard.keyUp(character);
    }
  };
  const key = (name: string, modifiers: UiKeyModifiers = noKeyModifiers()) =>
    runtime.input.keyboard.keyDown(name, modifiers);
  const press = (x: number, y: number, modifiers: UiKeyModifiers = noKeyModifiers()): void => {
    runtime.input.pointer.pointerDown(x, y, 1, modifiers);
    runtime.input.pointer.pointerUp(x, y, 0, modifiers);
  };
  return { runtime, clock, tick, states, field, model, type, key, press, find };
}

describe('NodalRuntime editing', () => {
  it('focuses an editable on press and places the caret at the nearest boundary', () => {
    const { runtime, field, model, press } = mount(Column(EditableText({ value: 'hello' })));
    press(7 * 2 + 3, 5);
    expect(runtime.input.focus.focusedNode).toBe(field);
    expect(model().focused).toBe(true);
    expect(model().focus).toBe(2);
    press(7 * 2 + 4, 5, mods({ shift: true }));
    expect(model().start).toBe(2);
    expect(model().end).toBe(3);
  });

  it('types through key presses when no shell proxy supplies text, and reports each change', () => {
    const changes: string[] = [];
    const { runtime, field, model, press, type, tick } = mount(
      Column(
        { x: 'start' },
        EditableText({ value: 'ab', onInput: (event: UiTextChangeEvent) => changes.push(event.value) })
      )
    );
    press(13, 5);
    expect(model().focus).toBe(2);
    type('cd');
    expect(model().text).toBe('abcd');
    expect(changes).toEqual(['abc', 'abcd']);
    // The text is content and layout: the field is as wide as the new text.
    tick();
    expect(runtime.debugLayoutBox(field).width).toBe(28);
  });

  it('edits with the keyboard: arrows, shift-select, Backspace, Home/End, select all, undo and redo', () => {
    const { model, press, type, key } = mount(Column(EditableText({ value: '' })));
    press(0, 5);
    type('hello');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(model().focus).toBe(3);
    key('Backspace');
    expect(model().text).toBe('helo');
    key('End');
    type('!');
    expect(model().text).toBe('helo!');
    key('Home');
    key('ArrowRight', mods({ shift: true }));
    key('ArrowRight', mods({ shift: true }));
    expect(model().selectedText).toBe('he');
    type('J');
    expect(model().text).toBe('Jlo!');
    key('z', mods({ ctrl: true }));
    expect(model().text).toBe('helo!');
    key('y', mods({ ctrl: true }));
    expect(model().text).toBe('Jlo!');
    key('a', mods({ ctrl: true }));
    expect(model().selectedText).toBe('Jlo!');
  });

  it('moves the caret through typed spaces, including trailing ones', () => {
    const { runtime, press, type, tick, states } = mount(
      Column({ x: 'start' }, EditableText({ value: '', width: 200 }))
    );
    press(0, 5);
    type('a');
    tick();
    type(' ');
    tick();
    type(' ');
    tick();
    const carets = states.filter(state => state !== null).map(state => state!.caret.x);
    // 7px per character: after 'a', 'a ', 'a  '.
    expect(carets).toEqual([7, 14, 21]);
    type('b');
    tick();
    expect(runtime.editingState!.caret.x).toBe(28);
    // Clicking past the trailing spaces lands after them.
    type(' ');
    tick();
    press(200, 5);
    expect(runtime.input.editing.state()!.selectionStart).toBe(5);
  });

  it('marks handled editing keys default-prevented and leaves Enter to the app in a single-line field', () => {
    const { key, press, model } = mount(Column(EditableText({ value: 'a' })));
    press(100, 5);
    expect(key('ArrowLeft').defaultPrevented).toBe(true);
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(model().text).toBe('a');
  });

  it('inserts a newline on Enter in a multiline field and grows by a line', () => {
    const { runtime, field, key, press, model, tick } = mount(
      Column(EditableText({ value: 'a', multiline: true, width: 200 }))
    );
    tick();
    const before = runtime.debugLayoutBox(field).height;
    press(100, 5);
    expect(key('Enter').defaultPrevented).toBe(true);
    expect(model().text).toBe('a\n');
    tick();
    expect(runtime.debugLayoutBox(field).height).toBeCloseTo(before * 2, 5);
  });

  it('moves the caret vertically through wrapped lines, keeping its x', () => {
    // 'hello world again' at 7px/char wraps at 42px: hello / world / again.
    const { key, press, model } = mount(
      Column(EditableText({ value: 'hello world again', multiline: true, width: 42 }))
    );
    press(5, 5);
    key('Home');
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowDown');
    expect(model().focus).toBe(8);
    key('ArrowDown');
    expect(model().focus).toBe(14);
    key('ArrowDown');
    expect(model().focus).toBe(17);
    key('ArrowUp');
    key('ArrowUp');
    key('ArrowUp');
    expect(model().focus).toBe(0);
  });

  it('takes text from beforeinput when a proxy is the text source, and not from printable keys', () => {
    const { runtime, press, type, model } = mount(Column(EditableText({ value: '' })));
    runtime.setTextInputSource('proxy');
    press(0, 5);
    type('x');
    expect(model().text).toBe('');
    expect(runtime.input.editing.beforeInput('insertText', 'x')).toBe(true);
    expect(model().text).toBe('x');
    runtime.input.editing.beforeInput('deleteContentBackward', null);
    expect(model().text).toBe('');
    // Navigation and shortcuts still come from the keys.
    runtime.input.editing.beforeInput('insertText', 'abc');
    runtime.input.keyboard.keyDown('ArrowLeft');
    expect(model().focus).toBe(2);
  });

  it('composes through the IME: updates replace in place, the commit lands once and undoes as one', () => {
    const changes: string[] = [];
    const { runtime, press, model } = mount(
      Column(EditableText({ value: 'a', onInput: (event: UiTextChangeEvent) => changes.push(event.value) }))
    );
    runtime.setTextInputSource('proxy');
    press(100, 5);
    const editing = runtime.input.editing;
    editing.compositionStart();
    editing.compositionUpdate('n', 1);
    editing.compositionUpdate('ni', 2);
    expect(model().text).toBe('ani');
    expect(model().composing).toBe(true);
    expect(runtime.input.editing.state()?.composing).toBe(true);
    editing.compositionEnd('你');
    expect(model().text).toBe('a你');
    expect(model().composing).toBe(false);
    expect(changes).toEqual(['a你']);
    runtime.input.keyboard.keyDown('z', mods({ ctrl: true }));
    expect(model().text).toBe('a');
  });

  it('pastes, folding newlines into spaces in a single-line field', () => {
    const { runtime, press, model } = mount(Column(EditableText({ value: '' })));
    press(0, 5);
    runtime.input.editing.paste('one\ntwo');
    expect(model().text).toBe('one two');
  });

  it('lets a beforeinput listener reject an edit', () => {
    const { press, type, model } = mount(
      Column(
        EditableText({
          value: '',
          onBeforeInput: event => {
            if (event.data !== null && /\D/.test(event.data)) {
              event.preventDefault();
            }
          }
        })
      )
    );
    press(0, 5);
    type('1a2');
    expect(model().text).toBe('12');
  });

  it('allows selection but no edits in a read-only field', () => {
    const { press, type, key, model } = mount(Column(EditableText({ value: 'abc', readOnly: true })));
    press(100, 5);
    type('x');
    key('Backspace');
    expect(model().text).toBe('abc');
    key('a', mods({ ctrl: true }));
    expect(model().selectedText).toBe('abc');
  });

  it('follows a controlled value without disturbing the caret, and takes a new value from outside', () => {
    const value$ = new BehaviorSubject('ab');
    const { press, type, model, tick } = mount(
      Column(EditableText({ value: value$, onInput: (event: UiTextChangeEvent) => value$.next(event.value) }))
    );
    press(7, 5);
    type('X');
    expect(value$.value).toBe('aXb');
    tick();
    expect(model().text).toBe('aXb');
    expect(model().focus).toBe(2);
    value$.next('zz');
    tick();
    expect(model().text).toBe('zz');
    expect(model().focus).toBe(2);
  });

  it('selects a word on double-click and the line on triple-click', () => {
    const { runtime, model } = mount(Column(EditableText({ value: 'one two three' })));
    const down = () => runtime.input.pointer.pointerDown(7 * 5, 5, 1, noKeyModifiers());
    const up = () => runtime.input.pointer.pointerUp(7 * 5, 5, 0, noKeyModifiers());
    down();
    up();
    down();
    up();
    expect(model().selectedText).toBe('two');
    down();
    up();
    expect(model().selectedText).toBe('one two three');
  });

  it('extends the selection while dragging', () => {
    const { runtime, model } = mount(Column(EditableText({ value: 'hello' })));
    runtime.input.pointer.pointerDown(7, 5, 1, noKeyModifiers());
    runtime.input.pointer.pointerMove(7 * 4, 5, 1, noKeyModifiers());
    expect(model().anchor).toBe(1);
    expect(model().focus).toBe(4);
    runtime.input.pointer.pointerUp(7 * 4, 5, 0, noKeyModifiers());
    runtime.input.pointer.pointerMove(0, 5, 0, noKeyModifiers());
    expect(model().focus).toBe(4);
  });

  it('reports the editing state to the shell on focus, after edits, and null on blur', () => {
    const { runtime, states, press, type, tick, find } = mount(
      Column({ gap: 10 }, EditableText({ value: 'ab', padding: 4 }), Button({ width: 40, height: 20 }))
    );
    expect(states).toEqual([]);
    press(100, 5);
    tick();
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ text: 'ab', selectionStart: 2, selectionEnd: 2, multiline: false });
    // Caret at the end of 'ab' inside 4px of padding: x = 4 + 14; height is the 14px font's 16.8px line.
    expect(states[0]!.caret.x).toBeCloseTo(18, 5);
    expect(states[0]!.caret.y).toBe(4);
    expect(states[0]!.caret.height).toBeCloseTo(16.8, 5);
    type('c');
    tick();
    expect(states[1]).toMatchObject({ text: 'abc', selectionStart: 3 });
    const button = find(UiNodeType.Button);
    runtime.input.focus.focus(button);
    tick();
    expect(states[2]).toBeNull();
    expect(runtime.editingState).toBeNull();
  });

  it('blinks the caret only while a field with a collapsed selection has focus', () => {
    const { runtime, press, key } = mount(Column(EditableText({ value: 'ab' })));
    expect(runtime.input.editing.nextCaretChange(1000)).toBeUndefined();
    press(100, 5);
    expect(runtime.input.editing.nextCaretChange(1000)).toBeGreaterThan(1000);
    key('a', mods({ ctrl: true }));
    expect(runtime.input.editing.nextCaretChange(1000)).toBeUndefined();
    key('End');
    runtime.setVisible(false);
    expect(runtime.input.editing.nextCaretChange(1000)).toBeUndefined();
    runtime.setVisible(true);
    expect(runtime.input.editing.nextCaretChange(1000)).toBeDefined();
  });

  it('moves focus on with Tab and shows the text cursor over a field', () => {
    const { runtime, press, key, find, tick } = mount(
      Column({ gap: 10 }, EditableText({ value: 'ab' }), Button({ width: 40, height: 20 }))
    );
    press(100, 5);
    key('Tab');
    expect(runtime.input.focus.focusedNode).toBe(find(UiNodeType.Button));
    runtime.input.pointer.pointerMove(5, 5, 0, noKeyModifiers());
    tick();
    expect(runtime.cursor).toBe('text');
  });

  it('scrolls the caret into view inside a scroll container', () => {
    // Eight 16.8px lines in a 40px viewport: End goes to the last line.
    const lines = Array.from({ length: 8 }, (_, i) => `line ${i}`).join('\n');
    const { press, key, tick, find } = mount(
      Column(
        ScrollView({ height: 40, width: 200 }, EditableText({ value: lines, multiline: true })),
        Text({ text: 'x' })
      )
    );
    press(5, 5);
    key('End', mods({ ctrl: true }));
    tick();
    const scroller = find(UiNodeType.ScrollView);
    expect(scroller.properties.get('scrollY')).toBeGreaterThan(0);
  });

  it('scrolls its own text so the caret stays inside a field narrower than its line', () => {
    // 26 characters at 7px in a 70px field: ten fit, the caret is at 182.
    const { runtime, field, model, press, key, tick } = mount(
      Column(EditableText({ value: 'abcdefghijklmnopqrstuvwxyz', width: 70 }))
    );
    press(5, 5);
    key('End');
    tick();
    expect(model().focus).toBe(26);
    const scroll = runtime.explain(field).scroll!;
    expect(scroll.contentWidth).toBe(182);
    // Far enough that the caret at the end of the text is the last
    // pixel inside the box, and no further.
    expect(scroll.scrollX).toBe(182 + 1 - 70);
    // Home brings it back to the start of the line.
    key('Home');
    tick();
    expect(runtime.explain(field).scroll!.scrollX).toBe(0);
  });

  it("reads a press through the field's own scroll, and keeps the shell caret inside the box", () => {
    const { runtime, field, model, press, key, tick, states } = mount(
      Column(EditableText({ value: 'abcdefghijklmnopqrstuvwxyz', width: 70 }))
    );
    press(5, 5);
    key('End');
    tick();
    // 60px into a field scrolled by 113 is the boundary nearest 173.
    press(60, 5);
    expect(model().focus).toBe(25);
    const box = runtime.debugLayoutBox(field);
    const caret = states[states.length - 1]!.caret;
    expect(caret.x).toBeGreaterThanOrEqual(box.x);
    expect(caret.x).toBeLessThan(box.x + box.width);
  });

  it('clips a field to its box and scrolls nothing when the text fits', () => {
    const { runtime, field, key, press, tick } = mount(Column(EditableText({ value: 'ab', width: 70 })));
    press(5, 5);
    key('End');
    tick();
    expect(runtime.explain(field).state.clips).toBe(true);
    expect(runtime.explain(field).scroll!.scrollX).toBe(0);
  });

  it('sizes an empty field by its placeholder', () => {
    const { runtime, field, tick } = mount(Column({ x: 'start' }, EditableText({ value: '', placeholder: 'Search…' })));
    tick();
    expect(runtime.debugLayoutBox(field).width).toBe(7 * 'Search…'.length);
  });
});

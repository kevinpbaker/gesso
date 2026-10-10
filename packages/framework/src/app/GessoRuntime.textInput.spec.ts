import { describe, expect, it, vi } from 'vitest';

import {
  Box,
  Column,
  EditableText,
  editorOf,
  noKeyModifiers,
  UiManualFrameClock,
  type CanvasHost,
  type UiBeforeInputEvent,
  type UiCompositionEvent,
  type UiElement,
  type UiKeyboardEvent,
  type UiKeyModifiers,
  type UiNode,
  type UiPasteEvent,
  type UiTextInputState
} from 'gesso-core';
import { GessoRuntime } from './GessoRuntime';

/**
 * A `textInput` surface: a node that keeps and draws its own text and
 * takes typed text, composition and the clipboard as events.
 */
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
    'strokeRect'
  ])
    ctx[m] = vi.fn();
  for (const m of [
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
  Object.assign(ctx, { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px sans-serif' });
  return { width: 800, height: 600, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

const mods = (partial: Partial<UiKeyModifiers> = {}): UiKeyModifiers => ({ ...noKeyModifiers(), ...partial });

function mount(root: (ref: (node: UiNode | null) => void) => UiElement) {
  let clock!: UiManualFrameClock;
  let node!: UiNode;
  const runtime = new GessoRuntime({
    root: root(n => {
      if (n !== null) node = n;
    }),
    canvas: mockCanvas(),
    width: 800,
    height: 600,
    clock: cb => (clock = new UiManualFrameClock(cb))
  });
  runtime.start();
  const tick = (): void => {
    if (clock.isPending) clock.tick(16);
  };
  tick();
  return { runtime, node: () => node, tick };
}

/** A surface that records what reaches it. */
function surface(state: Partial<UiTextInputState> = {}, onKeyDown?: (event: UiKeyboardEvent) => void) {
  const heard: string[] = [];
  const element = (ref: (node: UiNode | null) => void): UiElement =>
    Column(
      { padding: 40 },
      Box({
        ref,
        width: 300,
        height: 200,
        focusable: true,
        textInput: () => ({
          text: 'line',
          selectionStart: 2,
          selectionEnd: 2,
          caret: { x: 14, y: 20, width: 1, height: 20 },
          ...state
        }),
        onKeyDown: (event: UiKeyboardEvent) => {
          heard.push(`key ${event.key}${event.textFollows ? ' (text follows)' : ''}`);
          onKeyDown?.(event);
        },
        onBeforeInput: (event: UiBeforeInputEvent) => heard.push(`${event.inputType} ${JSON.stringify(event.data)}`),
        onCompositionStart: () => heard.push('composition start'),
        onCompositionUpdate: (event: UiCompositionEvent) => heard.push(`composition ${event.text} @${event.caret}`),
        onCompositionEnd: (event: UiCompositionEvent) => heard.push(`composition end ${JSON.stringify(event.text)}`),
        onPaste: (event: UiPasteEvent) => {
          heard.push(`paste ${event.text}`);
          event.preventDefault();
        }
      })
    );
  return { heard, element };
}

describe('a textInput surface', () => {
  it('has the shell mirror what it says, with its caret placed on the canvas', () => {
    const { element } = surface({ clipboard: 'line\n' });
    const { runtime, node, tick } = mount(element);
    expect(runtime.input.editing.state()).toBeNull();
    runtime.input.focus.focus(node());
    tick();
    const state = runtime.input.editing.state()!;
    expect(state).toMatchObject({
      text: 'line',
      selectionStart: 2,
      selectionEnd: 2,
      multiline: true,
      composing: false,
      clipboard: 'line\n'
    });
    // The node is at (40, 40); its caret is at (14, 20) inside it.
    expect(state.caret).toMatchObject({ x: 54, y: 60, height: 20 });
  });

  it('takes typed text, composition and paste as events, and keeps nothing itself', () => {
    const { heard, element } = surface();
    const { runtime, node } = mount(element);
    runtime.setTextInputSource('proxy');
    runtime.input.focus.focus(node());
    const editing = runtime.input.editing;
    runtime.input.keyboard.keyDown('a', mods(), true);
    editing.beforeInput('insertText', 'a');
    editing.compositionStart();
    expect(editing.state()?.composing).toBe(true);
    editing.compositionUpdate('ni', 2);
    editing.compositionEnd('你');
    expect(editing.state()?.composing).toBe(false);
    editing.paste('pasted');
    editing.beforeInput('deleteByCut', null);
    expect(heard).toEqual([
      'key a (text follows)',
      'insertText "a"',
      'composition start',
      'composition ni @2',
      'composition end "你"',
      'paste pasted',
      'deleteByCut null'
    ]);
  });

  it('drops the text of a key its listener cancelled, as a browser does', () => {
    // Option+Z types Ω on a Mac. A surface that binds Alt+Z to a command
    // cancels the key, but in a worker the shell sends the Ω anyway.
    const { heard, element } = surface({}, event => {
      if (event.modifiers.alt) event.preventDefault();
    });
    const { runtime, node } = mount(element);
    runtime.setTextInputSource('proxy');
    runtime.input.focus.focus(node());
    const { keyboard, editing } = runtime.input;
    keyboard.keyDown('Ω', mods({ alt: true }), true);
    editing.beforeInput('insertText', 'Ω');
    keyboard.keyUp('Ω', mods({ alt: true }));
    keyboard.keyDown('b', mods(), true);
    editing.beforeInput('insertText', 'b');
    keyboard.keyUp('b', mods());
    // Text with no key before it (a dictation) after a cancelled key's key up.
    keyboard.keyDown('Ω', mods({ alt: true }), true);
    keyboard.keyUp('Ω', mods({ alt: true }));
    editing.beforeInput('insertText', 'spoken');
    expect(heard.filter(line => line.startsWith('insertText'))).toEqual(['insertText "b"', 'insertText "spoken"']);
  });

  it('says when no text follows a key, so the surface inserts it itself', () => {
    const { heard, element } = surface();
    const { runtime, node } = mount(element);
    runtime.input.focus.focus(node());
    runtime.input.keyboard.keyDown('a', mods());
    runtime.setTextInputSource('proxy');
    runtime.input.keyboard.keyDown('b', mods());
    // The worker shell says so for a key that reached the canvas.
    runtime.input.keyboard.keyDown('c', mods(), false);
    expect(heard).toEqual(['key a', 'key b (text follows)', 'key c']);
  });

  it('carries the physical key, which a modifier does not change', () => {
    const codes: string[] = [];
    const { runtime, node } = mount(ref =>
      Box({
        ref,
        width: 10,
        height: 10,
        focusable: true,
        onKeyDown: (event: UiKeyboardEvent) => codes.push(`${event.key} ${event.code}`)
      })
    );
    runtime.input.focus.focus(node());
    runtime.input.keyboard.keyDown('Ω', mods({ alt: true }), true, 'KeyZ');
    runtime.input.keyboard.keyDown('a', mods());
    expect(codes).toEqual(['Ω KeyZ', 'a ']);
  });

  it('commits an open composition when it loses focus', () => {
    const { heard, element } = surface();
    const { runtime, node } = mount(element);
    runtime.input.focus.focus(node());
    runtime.input.editing.compositionStart();
    runtime.input.editing.compositionUpdate('かな', 2);
    runtime.input.focus.blur();
    expect(heard.slice(-1)).toEqual(['composition end "かな"']);
    expect(runtime.input.editing.state()).toBeNull();
  });
});

describe('a cancelled key in a field', () => {
  it('drops the text that follows it', () => {
    let field!: UiNode;
    const { runtime } = mount(() =>
      Column(
        EditableText({
          ref: node => {
            if (node !== null) field = node;
          },
          value: 'a',
          onKeyDown: (event: UiKeyboardEvent) => {
            if (event.key === 'x') event.preventDefault();
          }
        })
      )
    );
    runtime.setTextInputSource('proxy');
    runtime.input.focus.focus(field);
    const { keyboard, editing } = runtime.input;
    editorOf(field)!.select(1);
    keyboard.keyDown('x', mods(), true);
    editing.beforeInput('insertText', 'x');
    keyboard.keyUp('x', mods());
    keyboard.keyDown('y', mods(), true);
    editing.beforeInput('insertText', 'y');
    expect(editorOf(field)!.text).toBe('ay');
  });
});

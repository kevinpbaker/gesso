import { describe, expect, it, vi } from 'vitest';

import { Component } from '../../Component';
import { Define, Inject } from '../../decorators';
import { Button, Column, EditableText } from '../../../ui/composition/UiComponents';
import type { CanvasHost } from '../../../ui/rendering';
import { ShellStore } from '../ShellStore';
import { RenderWorkerApp } from './renderRoot';
import type { RuntimeToShellMessage, ShellToRuntimeMessage } from './RenderWorkerProtocol';

function createMockCanvas(width = 800, height = 600): CanvasHost {
  const ctx: Record<string, unknown> = {};
  for (const method of [
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
  ]) {
    ctx[method] = vi.fn();
  }
  ctx.measureText = vi.fn((text: string) => ({ width: String(text).length * 7 }));
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
  return { width, height, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

function createFakeWorkerGlobal() {
  const sent: RuntimeToShellMessage[] = [];
  const host = {
    onmessage: null as ((event: MessageEvent<ShellToRuntimeMessage>) => void) | null,
    postMessage: (message: RuntimeToShellMessage) => sent.push(message)
  };
  const send = (message: ShellToRuntimeMessage): void => {
    host.onmessage?.({ data: message } as MessageEvent<ShellToRuntimeMessage>);
  };
  return { host, sent, send };
}

const values: string[] = [];

@Define('editing-worker-root')
class EditingRoot extends Component {
  @Inject(ShellStore) shell!: ShellStore;

  override render() {
    return Column(
      { gap: 10 },
      EditableText({ value: 'ab', onInput: event => values.push(event.value) }),
      Button({
        width: 40,
        height: 20,
        onClick: () => {
          this.shell.dispatch('copyText', 'copied!');
          this.shell.dispatch('openUrl', 'https://example.test/');
        }
      })
    );
  }
}

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };

function start(textInput: 'proxy' | 'keys' = 'proxy') {
  const { host, sent, send } = createFakeWorkerGlobal();
  new RenderWorkerApp(EditingRoot, host);
  send({
    type: 'init',
    canvas: createMockCanvas() as unknown as OffscreenCanvas,
    width: 800,
    height: 600,
    dpr: 1,
    textInput
  });
  values.length = 0;
  const editing = () => sent.filter(message => message.type === 'editing');
  const press = (x: number, y: number): void => {
    send({ type: 'pointerDown', x, y, buttons: 1, modifiers: NO_MODS });
    send({ type: 'pointerUp', x, y, buttons: 0, modifiers: NO_MODS });
  };
  return { sent, send, editing, press };
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 40));
}

describe('RenderWorkerApp editing', () => {
  it('reports the focused editable to the shell and edits from beforeInput', async () => {
    const { send, editing, press } = start();
    press(100, 5);
    await settle();
    const first = editing().at(-1)!;
    expect(first.type === 'editing' && first.state).toMatchObject({ text: 'ab', selectionStart: 2, selectionEnd: 2 });

    // With a proxy, a printable key is not text…
    send({ type: 'keyDown', key: 'x', modifiers: NO_MODS });
    send({ type: 'beforeInput', inputType: 'insertText', data: 'c' });
    await settle();
    expect(values).toEqual(['abc']);
    const after = editing().at(-1)!;
    expect(after.type === 'editing' && after.state?.text).toBe('abc');
    // …but the caret box moved with it, one character to the right.
    const caretBefore = first.type === 'editing' ? first.state!.caret.x : 0;
    const caretAfter = after.type === 'editing' ? after.state!.caret.x : 0;
    expect(caretAfter - caretBefore).toBe(7);
  });

  it('runs a composition and a paste through the protocol', async () => {
    const { send, press, editing } = start();
    press(100, 5);
    send({ type: 'compositionStart' });
    send({ type: 'compositionUpdate', text: 'ni', caret: 2 });
    await settle();
    const composing = editing().at(-1)!;
    expect(composing.type === 'editing' && composing.state).toMatchObject({ text: 'abni', composing: true });
    send({ type: 'compositionEnd', text: '你' });
    send({ type: 'paste', text: ' pasted' });
    await settle();
    expect(values).toEqual(['ab你', 'ab你 pasted']);
  });

  it('clears the editable on a shell blur and reports null', async () => {
    const { send, press, editing } = start();
    press(100, 5);
    await settle();
    send({ type: 'blur' });
    await settle();
    const last = editing().at(-1)!;
    expect(last.type === 'editing' && last.state).toBeNull();
  });

  it('types from keys when the shell declares no proxy', async () => {
    const { send, press } = start('keys');
    press(100, 5);
    send({ type: 'keyDown', key: 'x', modifiers: NO_MODS });
    await settle();
    expect(values).toEqual(['abx']);
  });

  it('forwards ShellStore requests as clipboard and openUrl messages', async () => {
    const { sent, press } = start();
    await settle();
    // The button sits 10px below the 16.8px field.
    press(10, 40);
    await settle();
    expect(sent.filter(m => m.type === 'clipboard')).toEqual([{ type: 'clipboard', text: 'copied!' }]);
    expect(sent.filter(m => m.type === 'openUrl')).toEqual([{ type: 'openUrl', url: 'https://example.test/' }]);
  });

  it('accepts a visibility change', () => {
    const { send } = start();
    expect(() => send({ type: 'visibility', visible: false })).not.toThrow();
    expect(() => send({ type: 'visibility', visible: true })).not.toThrow();
  });
});

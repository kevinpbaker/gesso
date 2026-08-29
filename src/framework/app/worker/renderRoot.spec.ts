import { describe, expect, it, vi } from 'vitest';
import { map } from 'rxjs/operators';

import { Component } from '../../Component';
import { Define } from '../../decorators';
import { state } from '../../State';
import { State as ComponentState } from '../../store/decorators';
import { createComponent } from '../../createComponent';
import { Store } from '../../store/Store';
import { Box, Column, Text } from '../../../ui/composition/UiComponents';
import type { CanvasHost } from '../../../ui/rendering';
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

/**
 * Stands in for the worker global: collects outbound messages and
 * lets a test deliver inbound ones.
 */
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

const clicks: string[] = [];

@Define('worker-root')
class WorkerRoot extends Component {
  @ComponentState() count = state(0);

  override render() {
    return Column(
      Text({ text: this.count.pipe(map(c => `count: ${c}`)) }),
      Box({
        width: 200,
        height: 100,
        cursor: 'pointer',
        onClick: () => {
          clicks.push('clicked');
          this.count.value++;
        }
      })
    );
  }
}

@Define('broken-root')
class BrokenRoot extends Component {
  override render(): never {
    throw new Error('render exploded');
  }
}

function initMessage(canvas: CanvasHost, width = 800, height = 600): ShellToRuntimeMessage {
  return { type: 'init', canvas: canvas as unknown as OffscreenCanvas, width, height, dpr: 2 };
}

const noKeyModifiers = { shift: false, ctrl: false, alt: false, meta: false };

describe('RenderWorkerApp', () => {
  it('builds and paints when the shell sends the canvas', async () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    const canvas = createMockCanvas();
    new RenderWorkerApp(createComponent(WorkerRoot), host);

    send(initMessage(canvas));

    expect(sent.map(m => m.type)).toContain('ready');
    // The runtime is timer-paced inside a worker, so let a frame land.
    await vi.waitFor(() => {
      expect(sent.some(m => m.type === 'frame')).toBe(true);
    });
    const ctx = canvas.getContext('2d') as unknown as { fillText: ReturnType<typeof vi.fn> };
    expect(ctx.fillText.mock.calls.length).toBeGreaterThan(0);
  });

  it('sizes the backing store from the shell-supplied dpr', () => {
    const { host, send } = createFakeWorkerGlobal();
    const canvas = createMockCanvas();
    new RenderWorkerApp(createComponent(WorkerRoot), host);

    send(initMessage(canvas, 400, 300));

    // The worker has no window.devicePixelRatio; it must use what the
    // shell forwarded.
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('routes forwarded pointer events into component handlers', () => {
    clicks.length = 0;
    const { host, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);

    send(initMessage(createMockCanvas()));
    // The Box sits below the text line, inside its 200x100 box.
    send({ type: 'pointerDown', x: 40, y: 40, buttons: 1, modifiers: noKeyModifiers });
    send({ type: 'pointerUp', x: 40, y: 40, buttons: 0, modifiers: noKeyModifiers });

    expect(clicks).toEqual(['clicked']);
  });

  it('repaints when the shell forwards a resize', async () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    const canvas = createMockCanvas();
    new RenderWorkerApp(createComponent(WorkerRoot), host);
    send(initMessage(canvas));
    await vi.waitFor(() => expect(sent.some(m => m.type === 'frame')).toBe(true));

    const framesBefore = sent.filter(m => m.type === 'frame').length;
    send({ type: 'resize', width: 500, height: 400, dpr: 1 });

    expect(canvas.width).toBe(500);
    await vi.waitFor(() => {
      expect(sent.filter(m => m.type === 'frame').length).toBeGreaterThan(framesBefore);
    });
  });

  it('reports errors to the shell instead of throwing into the void', () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(BrokenRoot), host);

    // An uncaught throw inside a worker is invisible to the page, so
    // the failure has to come back as a message.
    expect(() => send(initMessage(createMockCanvas()))).not.toThrow();

    const error = sent.find(m => m.type === 'error');
    expect(error).toBeDefined();
    expect(error && 'message' in error && error.message).toBe('render exploded');
  });

  it('ignores input that arrives before init', () => {
    clicks.length = 0;
    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);

    expect(() => send({ type: 'pointerDown', x: 10, y: 10, buttons: 1, modifiers: noKeyModifiers })).not.toThrow();
    expect(clicks).toEqual([]);
    expect(sent.filter(m => m.type === 'error')).toHaveLength(0);
  });

  it('stops rendering after dispose', async () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);
    send(initMessage(createMockCanvas()));
    await vi.waitFor(() => expect(sent.some(m => m.type === 'frame')).toBe(true));

    send({ type: 'dispose' });
    const framesAfterDispose = sent.filter(m => m.type === 'frame').length;

    send({ type: 'resize', width: 300, height: 300, dpr: 1 });
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(sent.filter(m => m.type === 'frame')).toHaveLength(framesAfterDispose);
  });

  it('rejects stores registered after the runtime started', () => {
    const { host, send } = createFakeWorkerGlobal();
    const app = new RenderWorkerApp(createComponent(WorkerRoot), host);
    send(initMessage(createMockCanvas()));

    class LateStore extends Store {}
    expect(() => app.useStore(LateStore)).toThrow(/after the runtime started/);
  });
});

describe('RenderWorkerApp inspector', () => {
  it('turns the inspector on from a shell message and reports the hovered explanation', async () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);
    send(initMessage(createMockCanvas()));
    await vi.waitFor(() => expect(sent.some(m => m.type === 'frame')).toBe(true));

    send({ type: 'inspector', enabled: true });
    // Nothing hovered yet: the shell is told so, and can clear its panel.
    expect(sent.filter(m => m.type === 'inspect').at(-1)).toEqual({ type: 'inspect', text: null });

    // Hover the 200×100 box below the text line.
    send({ type: 'pointerMove', x: 40, y: 40, buttons: 0, modifiers: noKeyModifiers });
    const inspect = sent.filter(m => m.type === 'inspect').at(-1);
    expect(inspect && 'text' in inspect && inspect.text).toMatch(/^box '.*' — 200 × 100 at/);
    expect(inspect && 'text' in inspect && inspect.text).toMatch(/width {2}200 {5}width: 200 \(explicit\)/);

    send({ type: 'inspector', enabled: false });
    expect(sent.filter(m => m.type === 'inspect').at(-1)).toEqual({ type: 'inspect', text: null });
  });
});

describe('RenderWorkerApp cursor', () => {
  it("reports the hovered node's cursor to the shell and clears it on leaving", async () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);
    send(initMessage(createMockCanvas()));
    await vi.waitFor(() => expect(sent.some(m => m.type === 'frame')).toBe(true));

    // Over the box, which asks for a pointer.
    send({ type: 'pointerMove', x: 40, y: 40, buttons: 0, modifiers: noKeyModifiers });
    expect(sent.filter(m => m.type === 'cursor').at(-1)).toEqual({ type: 'cursor', cursor: 'pointer' });

    // Off it: the shell restores the default.
    send({ type: 'pointerMove', x: 700, y: 500, buttons: 0, modifiers: noKeyModifiers });
    expect(sent.filter(m => m.type === 'cursor').at(-1)).toEqual({ type: 'cursor', cursor: null });
  });
});

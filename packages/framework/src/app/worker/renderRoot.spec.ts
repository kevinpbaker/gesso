import { describe, expect, it, vi } from 'vitest';
import { map } from 'rxjs/operators';

import { Component } from '../../Component';
import { Define } from '../../decorators';
import { internalState } from '../../InternalState';
import { createComponent } from '../../createComponent';
import { Box, Column, Text, UiInsetRegistry, type CanvasHost } from '@gesso/core';
import { RenderWorkerApp } from './renderRoot';
import { channel } from '../../channel/ChannelToken';
import type { ComponentContext, Inputs } from '../../FunctionComponent';
import { ShellService } from '../ShellService';
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
  const listeners = new Map<string, (event: unknown) => void>();
  const host = {
    onmessage: null as ((event: MessageEvent<ShellToRuntimeMessage>) => void) | null,
    postMessage: (message: RuntimeToShellMessage) => sent.push(message),
    // What the worker installs to catch what no message handler can
    // see; a test fires one by calling the recorded listener.
    addEventListener: (type: string, listener: (event: never) => void) => {
      listeners.set(type, listener as (event: unknown) => void);
    }
  };
  const send = (message: ShellToRuntimeMessage): void => {
    host.onmessage?.({ data: message } as MessageEvent<ShellToRuntimeMessage>);
  };
  /** Fires one of the listeners the worker installed on its global. */
  const emit = (type: 'error' | 'unhandledrejection', event: unknown): void => {
    const listener = listeners.get(type);
    if (listener === undefined) {
      throw new Error(`No '${type}' listener was installed on the worker global.`);
    }
    listener(event);
  };
  return { host, sent, send, emit };
}

const clicks: string[] = [];

@Define('worker-root')
class WorkerRoot extends Component {
  readonly count = internalState(0);

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

@Define('broken-listener-root')
class BrokenListenerRoot extends Component {
  override render() {
    return Box({
      width: 200,
      height: 100,
      onClick: () => {
        throw new Error('handler exploded');
      }
    });
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
    // Thrown while handling init, so the app is broken but nothing was
    // half-applied — which is a different sentence from `uncaught`.
    expect(error && 'source' in error && error.source).toBe('message');
  });

  it('reports a frame that threw under a forwarded tick, which `receive` does see', () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext('2d') as unknown as { fillText: () => void };
    new RenderWorkerApp(createComponent(WorkerRoot), host);
    send(initMessage(canvas));

    // Paint is the last phase of a frame, so a canvas call that throws
    // is a throw inside the frame and nowhere else. Nothing has been
    // awaited, so no timer has run: this frame can only be the one the
    // tick delivers.
    ctx.fillText = () => {
      throw new Error('paint exploded');
    };
    expect(() => send({ type: 'tick', time: 16 })).not.toThrow();

    // `UiHostFrameClock.tick` delivers the frame synchronously, so the
    // whole frame runs inside `receive`'s try and comes back labelled
    // `message`. This is what a frame throws as whenever the shell is
    // forwarding refreshes, which is every frame of a healthy app.
    const error = sent.find(m => m.type === 'error');
    expect(error).toBeDefined();
    expect(error && 'message' in error && error.message).toBe('paint exploded');
    expect(error && 'source' in error && error.source).toBe('message');
  });

  it('reports what threw outside any message handler', () => {
    const { host, sent, emit } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);

    // Module-scope work, a callback armed by something other than the
    // shell, and the self-paced frames `UiHostFrameClock` runs from its
    // own timer when no tick has arrived yet or the shell's thread is
    // blocked. Without this listener the page hears none of them.
    emit('error', { error: new Error('frame exploded'), message: 'Uncaught Error: frame exploded' });

    const error = sent.find(m => m.type === 'error');
    expect(error && 'message' in error && error.message).toBe('frame exploded');
    expect(error && 'source' in error && error.source).toBe('uncaught');
    expect(error && 'stack' in error && typeof error.stack).toBe('string');
  });

  it('keeps the location when the engine did not keep the error', () => {
    const { host, sent, emit } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);

    emit('error', { message: 'Script error.', filename: 'http://host/worker.js', lineno: 12, colno: 5 });

    const error = sent.find(m => m.type === 'error');
    expect(error && 'message' in error && error.message).toBe('Script error. (http://host/worker.js:12:5)');
  });

  it('reports a listener that threw, which the dispatcher swallows', () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(BrokenListenerRoot), host);
    send(initMessage(createMockCanvas()));

    send({ type: 'pointerDown', x: 40, y: 40, buttons: 1, modifiers: noKeyModifiers });
    send({ type: 'pointerUp', x: 40, y: 40, buttons: 0, modifiers: noKeyModifiers });

    // The dispatch has to continue past a broken listener, so nothing
    // rethrows and neither `receive` nor the global handler ever sees
    // this one. Before it was reported, an `onClick` that threw inside
    // a render worker was invisible to the page entirely.
    const error = sent.find(m => m.type === 'error');
    expect(error && 'message' in error && error.message).toContain('handler exploded');
    expect(error && 'source' in error && error.source).toBe('listener');
    expect(error && 'stack' in error && typeof error.stack).toBe('string');
  });

  it('reports a rejected promise nobody handled', () => {
    const { host, sent, emit } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);

    emit('unhandledrejection', { reason: new Error('load failed') });

    const error = sent.find(m => m.type === 'error');
    expect(error && 'message' in error && error.message).toBe('load failed');
    expect(error && 'source' in error && error.source).toBe('uncaught');
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

    const Late = channel<{ value: number }>('late', { value: 0 });
    expect(() => app.useChannel(Late)).toThrow(/after the runtime started/);
  });
});

describe('RenderWorkerApp inspector', () => {
  it('turns the inspector on from a shell message and reports the hovered node', async () => {
    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(WorkerRoot), host);
    send(initMessage(createMockCanvas()));
    await vi.waitFor(() => expect(sent.some(m => m.type === 'frame')).toBe(true));

    send({ type: 'inspector', enabled: true });
    // Nothing hovered yet: the shell is told so, and can clear its panel.
    expect(sent.filter(m => m.type === 'inspect').at(-1)).toEqual({ type: 'inspect', report: null });

    // Hover the 200×100 box below the text line.
    send({ type: 'pointerMove', x: 40, y: 40, buttons: 0, modifiers: noKeyModifiers });
    const inspect = sent.filter(m => m.type === 'inspect').at(-1);
    const report = inspect && 'report' in inspect ? inspect.report : null;
    expect(report?.type).toBe('box');
    expect(report?.box).toMatchObject({ width: 200, height: 100 });
    expect(report?.explanation).toMatch(/width {2}200 {5}width: 200 \(explicit\)/);
    // The report is what crosses the wire, so it has to be cloneable.
    expect(structuredClone(report)).toEqual(report);

    send({ type: 'inspector', enabled: false });
    expect(sent.filter(m => m.type === 'inspect').at(-1)).toEqual({ type: 'inspect', report: null });
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

describe('RenderWorkerApp colour scheme', () => {
  it('carries the appearance the shell reports through to a component', async () => {
    const seen: string[] = [];

    function Appearance(_inputs: Inputs<{}>, ctx: ComponentContext) {
      const shell = ctx.inject(ShellService);
      shell.colorScheme.subscribe(scheme => seen.push(scheme));
      return Text({ text: 'appearance' });
    }

    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(Appearance), host);
    send(initMessage(createMockCanvas()));
    await vi.waitFor(() => expect(sent.some(m => m.type === 'frame')).toBe(true));

    // Light until the shell says otherwise, which is what a shell too
    // old to send this message leaves the application with.
    expect(seen).toEqual(['light']);

    send({ type: 'colorScheme', scheme: 'dark' });
    expect(seen).toEqual(['light', 'dark']);
  });
});

describe('RenderWorkerApp viewport insets', () => {
  it('publishes what the shell reports into the registry the root provides', async () => {
    const registry = new UiInsetRegistry();
    const { host, sent, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(Box({ insets: registry }, Text({ text: 'page' })), host);
    send(initMessage(createMockCanvas()));
    await vi.waitFor(() => expect(sent.some(m => m.type === 'frame')).toBe(true));

    // The application's own bar is already there; the keyboard opens
    // over it and the two compose by maximum, not by sum.
    const bar = registry.publish({ bottom: 88 });
    send({ type: 'viewportInsets', insets: { top: 0, right: 0, bottom: 320, left: 0 } });
    expect(registry.current.bottom).toBe(320);

    send({ type: 'viewportInsets', insets: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(registry.current.bottom).toBe(88);
    bar();
  });
});

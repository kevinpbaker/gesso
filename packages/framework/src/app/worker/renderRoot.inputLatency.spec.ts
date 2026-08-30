import { describe, expect, it, vi } from 'vitest';

import { Component } from '../../Component';
import { Define } from '../../decorators';
import { Button, Column, EditableText, type CanvasHost } from '@gesso/core';
import { RenderWorkerApp } from './renderRoot';
import { epochNow, type RuntimeToShellMessage, type ShellToRuntimeMessage } from './RenderWorkerProtocol';

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

@Define('latency-root')
class LatencyRoot extends Component {
  override render() {
    return Column({ gap: 10 }, EditableText({ value: 'ab' }), Button({ width: 40, height: 20 }));
  }
}

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };

function start() {
  const sent: RuntimeToShellMessage[] = [];
  const host = {
    onmessage: null as ((event: MessageEvent<ShellToRuntimeMessage>) => void) | null,
    postMessage: (message: RuntimeToShellMessage) => sent.push(message)
  };
  const send = (message: ShellToRuntimeMessage): void => {
    host.onmessage?.({ data: message } as MessageEvent<ShellToRuntimeMessage>);
  };
  new RenderWorkerApp(LatencyRoot, host);
  send({
    type: 'init',
    canvas: createMockCanvas() as unknown as OffscreenCanvas,
    width: 800,
    height: 600,
    dpr: 1
  });
  const latencies = (): (number | null)[] =>
    sent
      .filter(message => message.type === 'frame')
      .map(message => (message as { inputLatencyMs: number | null }).inputLatencyMs);
  return { sent, send, latencies };
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 40));
}

describe('RenderWorkerApp input latency', () => {
  it('reports how long a stamped input waited for its frame', async () => {
    const { send, latencies } = start();
    await settle();
    const before = latencies().length;

    // Stamped 50ms in the past, as a shell that took 50ms to forward it
    // would have done.
    send({ type: 'pointerDown', x: 100, y: 5, buttons: 1, modifiers: NO_MODS, at: epochNow() - 50 });
    await settle();

    const reported = latencies()
      .slice(before)
      .filter(value => value !== null);
    expect(reported.length).toBeGreaterThan(0);
    expect(reported[0]!).toBeGreaterThanOrEqual(50);
  });

  it('reports null for an unstamped input, so a host that does not measure says nothing', async () => {
    const { send, latencies } = start();
    await settle();
    const before = latencies().length;

    send({ type: 'pointerDown', x: 100, y: 5, buttons: 1, modifiers: NO_MODS });
    await settle();

    expect(
      latencies()
        .slice(before)
        .every(value => value === null)
    ).toBe(true);
  });

  it('reports null on a frame no input asked for', async () => {
    const { send, latencies } = start();
    send({ type: 'pointerDown', x: 100, y: 5, buttons: 1, modifiers: NO_MODS, at: epochNow() });
    await settle();
    const before = latencies().length;

    // A resize dirties the tree without any input behind it. The mark
    // was already taken by the frame above, so this one has nothing to
    // report rather than repeating it.
    send({ type: 'resize', width: 900, height: 700, dpr: 1 });
    await settle();

    const after = latencies().slice(before);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(value => value === null)).toBe(true);
  });
});

import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { Box, type CanvasHost } from 'gesso-core';
import { createComponent } from '../../createComponent';
import { defineChannel } from '../../channel/ChannelToken';
import { serveChannels, serve } from '../../channel/serveChannels';
import { AGENT_PORT, remoteSurface } from '../../agent/remote';
import { portHandle } from '../../worker/WorkerPorts';
import { RenderWorkerApp } from './renderRoot';
import type { ShellToRuntimeMessage } from './RenderWorkerProtocol';

function mockCanvas(): CanvasHost {
  const ctx = new Proxy({ measureText: (text: string) => ({ width: text.length * 7 }) } as Record<string, unknown>, {
    get: (target, key) => target[key as string] ?? vi.fn()
  });
  return { width: 400, height: 300, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

/** The worker global, as far as the render worker and the port handshake use it. */
function fakeGlobal() {
  const host = {
    onmessage: null as ((event: { data: unknown; ports?: readonly MessagePort[] }) => void) | null,
    postMessage: () => {},
    addEventListener: () => {}
  };
  return {
    host,
    send: (message: ShellToRuntimeMessage) => host.onmessage?.({ data: message }),
    /** What `portHandle(worker).open(key)` does from the shell, delivered to the fake global. */
    open: (key: string) =>
      portHandle({
        postMessage: (message, transfer) => host.onmessage?.({ data: message, ports: transfer as MessagePort[] })
      }).open(key)
  };
}

const Counter = defineChannel('counter', { view: { count: 0 }, commands: {} as { add(by: number): void } });
const Clock = defineChannel('clock', { view: { now: 0 }, commands: {} });

describe('the render worker, asked by an agent', () => {
  it('answers with the channels it feeds and the ones its application worker serves', async () => {
    const { host, send, open } = fakeGlobal();
    const count = new BehaviorSubject(0);

    // The application worker, as a port the shell hands over in `init`:
    // its global is the far end of a MessageChannel, serving `clock`.
    const appLink = new MessageChannel();
    const appGlobal = appLink.port2 as unknown as Parameters<typeof serveChannels>[1];
    serveChannels([serve(Clock, { view: { now: new BehaviorSubject(1234) } })], appGlobal);
    appLink.port2.start();

    new RenderWorkerApp(
      createComponent(() => Box({ width: 10, height: 10 })),
      host as never
    )
      .useChannel(Counter, {
        source: { view: { count }, commands: { add: (by: number) => count.next(count.value + by) } }
      })
      .useChannel(Clock);
    send({
      type: 'init',
      canvas: mockCanvas() as unknown as OffscreenCanvas,
      width: 400,
      height: 300,
      dpr: 1,
      appPort: appLink.port1
    });

    const agent = remoteSurface(open(AGENT_PORT));
    expect((await agent.tools()).map(tool => tool.name)).toEqual(['counter_view', 'counter_add', 'clock_view']);
    expect((await agent.call('counter_add', { arguments: [3] })).structuredContent).toEqual({ count: 3 });
    expect(count.value).toBe(3);
    expect((await agent.call('clock_view', {})).structuredContent).toEqual({ now: 1234 });

    appLink.port1.close();
    appLink.port2.close();
  });
});

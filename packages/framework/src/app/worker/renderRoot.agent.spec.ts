import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { Box, Column, Text, type CanvasHost } from 'gesso-core';
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
    expect((await agent.tools()).map(tool => tool.name)).toEqual([
      'counter_view',
      'counter_add',
      'clock_view',
      'ui_snapshot',
      'ui_press',
      'ui_type',
      'ui_focus',
      'ui_key',
      'tokens_view',
      'render_frame'
    ]);
    expect((await agent.call('counter_add', { arguments: [3] })).structuredContent).toEqual({ count: 3 });
    expect(count.value).toBe(3);
    expect((await agent.call('clock_view', {})).structuredContent).toEqual({ now: 1234 });

    // And the screen, read through the same port.
    const screen = await agent.call('ui_snapshot', {});
    expect(screen.isError).toBe(false);

    appLink.port1.close();
    appLink.port2.close();
  });
});

describe("render_frame's modules", () => {
  it('loads a module the agent names the way the application said, with its path from the project root', async () => {
    const { host, send, open } = fakeGlobal();
    const asked: string[] = [];
    new RenderWorkerApp(
      createComponent(() => Box({ width: 10, height: 10 })),
      host as never
    ).loadModulesWith(async path => {
      asked.push(path);
      throw new Error('not served here');
    });
    send({ type: 'init', canvas: mockCanvas() as unknown as OffscreenCanvas, width: 400, height: 300, dpr: 1 });

    const agent = remoteSurface(open(AGENT_PORT));
    const result = await agent.call('render_frame', { module: 'mocks/Settings', width: 390 });

    expect(result.isError).toBe(true);
    expect(asked[0]).toBe('/mocks/Settings.tsx');
  });
});

describe('an application whose code throws as it loads', () => {
  const init = { type: 'init', canvas: mockCanvas() as unknown as OffscreenCanvas, width: 400, height: 300, dpr: 1 };
  const text = (result: { content: readonly { type: string; text?: string }[] }) =>
    result.content.map(part => part.text ?? '').join('');

  it('tells an agent what it threw, not that it has not started, until it starts', async () => {
    const { host, send, open } = fakeGlobal();
    let broken = true;
    new RenderWorkerApp(
      createComponent(() => {
        if (broken) throw new ReferenceError('Each is not defined');
        return Box({ width: 10, height: 10 });
      }),
      host as never
    );
    send(init as ShellToRuntimeMessage);

    const agent = remoteSurface(open(AGENT_PORT));
    const failed = await agent.call('ui_snapshot', {});
    expect(failed.isError).toBe(true);
    expect(text(failed)).toMatch(
      /^The application threw as it started, so there is no screen: ReferenceError: Each is not defined\nat /
    );
    expect(text(failed)).toMatch(/Fix the code, save, and try again\.$/);

    broken = false;
    send(init as ShellToRuntimeMessage);
    const started = await agent.call('ui_snapshot', {});
    expect(started.isError).toBe(false);
    expect(text(started)).not.toContain('threw');
  });

  it('starts when a change fixes the code, the way the dev server swaps in a saved file', async () => {
    const { host, send, open } = fakeGlobal();
    const app = new RenderWorkerApp(
      createComponent(() => {
        throw new ReferenceError('Each is not defined');
      }),
      host as never
    );
    send(init as ShellToRuntimeMessage);
    const agent = remoteSurface(open(AGENT_PORT));
    expect(text(await agent.call('ui_snapshot', {}))).toContain('Each is not defined');

    app.reload(() => Column(Text({ text: 'Expenses' })));
    const started = await agent.call('ui_snapshot', {});
    expect(started.isError).toBe(false);
    expect(text(started)).toContain('Expenses');
  });

  it('says the screen is from before a change that threw, and stops once a change loads', async () => {
    const { host, send, open } = fakeGlobal();
    const app = new RenderWorkerApp(
      createComponent(() => Box({ width: 10, height: 10 })),
      host as never
    );
    send(init as ShellToRuntimeMessage);
    const agent = remoteSurface(open(AGENT_PORT));

    expect(() =>
      app.reload(() => {
        throw new TypeError('rows.map is not a function');
      })
    ).toThrow('rows.map is not a function');
    expect(text(await agent.call('ui_snapshot', {}))).toMatch(
      /^The last change to the code threw as it loaded, so this is the screen from before it: TypeError: rows\.map is not a function/
    );

    app.reload(() => Box({ width: 20, height: 10 }));
    expect(text(await agent.call('ui_snapshot', {}))).not.toContain('threw');
  });
});

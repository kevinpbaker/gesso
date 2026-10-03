import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { defineChannel, describeChannel, serve } from 'gesso-framework';

import { messageBoxConfirm, serveDesktopAgent, type DesktopServe, type ShowMessageBox } from './agent';

const Counter = defineChannel('counter', {
  view: { count: 0 },
  commands: {} as { add(by: number): void; reset(): void }
});
describeChannel(Counter, {
  view: { type: 'object', properties: { count: { type: 'number' } } },
  commands: {
    add: { parameters: ['by'], input: { type: 'object', properties: { by: { type: 'number' } }, required: ['by'] } },
    reset: { parameters: [], input: { type: 'object', properties: {} }, confirm: true, destructive: true }
  }
});

function counter() {
  const count = new BehaviorSubject(3);
  return {
    count,
    served: serve(Counter, {
      view: { count },
      commands: { add: (by: number) => count.next(count.value + by), reset: () => count.next(0) }
    })
  };
}

/** A `Bun.serve` that keeps the handler, with some ports already taken. */
function fakeServe(taken: readonly number[] = []) {
  const started: { port: number; fetch: (request: Request) => Promise<Response> }[] = [];
  const stopped: number[] = [];
  const serve: DesktopServe = ({ port, fetch }) => {
    if (taken.includes(port)) {
      throw Object.assign(new Error(`Failed to start server. Is port ${port} in use?`), { code: 'EADDRINUSE' });
    }
    started.push({ port, fetch });
    return { stop: () => stopped.push(port) };
  };
  return { serve, started, stopped };
}

const call = (name: string, args: object) =>
  new Request('http://127.0.0.1:7310/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  });

describe('serveDesktopAgent', () => {
  it('serves the channels over MCP on this machine, at a URL it reports', async () => {
    const app = counter();
    const server = fakeServe();
    const agent = serveDesktopAgent([app.served], { serve: server.serve, name: 'my-app' });

    expect(agent.url).toBe('http://127.0.0.1:7310/mcp');
    const response = await server.started[0].fetch(call('counter_add', { by: 2 }));
    expect(((await response.json()) as { result: { structuredContent: unknown } }).result.structuredContent).toEqual({
      count: 5
    });
    expect(app.count.value).toBe(5);
  });

  it('takes the next free port when its own is taken', () => {
    const server = fakeServe([7310, 7311]);
    const agent = serveDesktopAgent([counter().served], { serve: server.serve });
    expect(agent.url).toBe('http://127.0.0.1:7312/mcp');
  });

  it('says so when every port it tries is taken, and rethrows anything else', () => {
    const busy = fakeServe(Array.from({ length: 10 }, (_, i) => 7400 + i));
    expect(() => serveDesktopAgent([counter().served], { serve: busy.serve, port: 7400 })).toThrow(
      'Ports 7400 to 7409 are all in use'
    );
    const broken: DesktopServe = () => {
      throw new Error('no network');
    };
    expect(() => serveDesktopAgent([counter().served], { serve: broken })).toThrow('no network');
  });

  it('refuses a request from a browser page', async () => {
    const server = fakeServe();
    serveDesktopAgent([counter().served], { serve: server.serve });
    const fromPage = new Request('http://127.0.0.1:7310/mcp', {
      method: 'POST',
      headers: { origin: 'https://example.com' },
      body: '{}'
    });
    expect((await server.started[0].fetch(fromPage)).status).toBe(403);
  });

  it('asks the person through confirm, and stops serving when told', async () => {
    const app = counter();
    const server = fakeServe();
    const confirm = vi.fn(() => false);
    const agent = serveDesktopAgent([app.served], { serve: server.serve, confirm });

    await server.started[0].fetch(call('counter_reset', {}));
    expect(confirm).toHaveBeenCalledOnce();
    expect(app.count.value).toBe(3);

    agent.stop();
    expect(server.stopped).toEqual([7310]);
  });
});

describe('messageBoxConfirm', () => {
  it('asks with the native dialog, defaulting to decline, and allows only on the first button', async () => {
    const shown: Parameters<ShowMessageBox>[0][] = [];
    let response = 1;
    const confirm = messageBoxConfirm(async options => {
      shown.push(options);
      return { response };
    });
    const request = {
      channel: 'notes',
      command: 'remove',
      description: 'Deletes a note for good.',
      arguments: { id: '7' },
      destructive: true
    };

    expect(await confirm(request)).toBe(false);
    response = 0;
    expect(await confirm(request)).toBe(true);
    expect(shown[0]).toMatchObject({
      type: 'warning',
      message: 'An AI agent wants to remove in notes. This cannot be undone.',
      buttons: ['Allow', 'Decline'],
      defaultId: 1,
      cancelId: 1
    });
    expect(shown[0].detail).toContain('Deletes a note for good.');
  });
});

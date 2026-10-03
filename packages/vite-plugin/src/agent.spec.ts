import { describe, expect, it } from 'vitest';

import {
  AGENT_PATH,
  createAgentBridge,
  EVENTS,
  type BridgeClient,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeSocket
} from './agent.ts';
import { transformShell, transformSyncShell } from './shell.ts';

/** Vite's HMR server, as far as the bridge uses it: events in, and a way to fire them. */
function fakeSocket() {
  const listeners = new Map<string, (data: never, client: BridgeClient) => void>();
  const socket: BridgeSocket = { on: (event, listener) => listeners.set(event, listener) };
  const emit = (event: string, data: unknown, client: BridgeClient) => listeners.get(event)?.(data as never, client);
  return { socket, emit };
}

/** A page connected over HMR, answering each request it is sent. */
function fakePage(emit: ReturnType<typeof fakeSocket>['emit'], answer: (message: unknown) => unknown) {
  const page: BridgeClient = {
    send: (event, payload) => {
      if (event === EVENTS.request) {
        const { id, message } = payload as { id: number; message: unknown };
        queueMicrotask(() => emit(EVENTS.response, { id, response: answer(message) }, page));
      }
    }
  };
  return page;
}

/** One request through the middleware, resolved with what the response ended with. */
function request(
  bridge: ReturnType<typeof createAgentBridge>,
  init: { method?: string; url?: string; body?: string; headers?: Record<string, string> }
): Promise<{ status: number; body: string | undefined; passed: boolean }> {
  return new Promise(resolve => {
    const handlers: Record<string, ((chunk?: unknown) => void)[]> = { data: [], end: [], error: [] };
    const req: BridgeRequest = {
      method: init.method ?? 'POST',
      url: init.url ?? AGENT_PATH,
      headers: init.headers ?? {},
      on: ((event: string, listener: (chunk?: unknown) => void) =>
        handlers[event].push(listener)) as BridgeRequest['on']
    };
    const res: BridgeResponse = {
      statusCode: 200,
      setHeader: () => {},
      end: body => resolve({ status: res.statusCode, body, passed: false })
    };
    bridge.middleware(req, res, () => resolve({ status: 0, body: undefined, passed: true }));
    queueMicrotask(() => {
      if (init.body !== undefined) {
        handlers.data.forEach(listener => listener(init.body));
      }
      handlers.end.forEach(listener => listener());
    });
  });
}

const ping = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' });

describe('the agent endpoint', () => {
  it('relays a message to the page that announced itself, and answers with what the page said', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket);
    const seen: unknown[] = [];
    emit(
      EVENTS.ready,
      {},
      fakePage(emit, message => (seen.push(message), { jsonrpc: '2.0', id: 7, result: {} }))
    );

    const response = await request(bridge, { body: ping });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body!)).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
    expect(seen).toEqual([JSON.parse(ping)]);
  });

  it('asks the newest page, and falls back to the one before when it closes', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket);
    const answer = (who: string) => () => ({ jsonrpc: '2.0', id: 7, result: { who } });
    const first = fakePage(emit, answer('first'));
    const second = fakePage(emit, answer('second'));
    emit(EVENTS.ready, {}, first);
    emit(EVENTS.ready, {}, second);

    expect(JSON.parse((await request(bridge, { body: ping })).body!).result.who).toBe('second');
    emit('vite:ws:disconnect', {}, second);
    expect(JSON.parse((await request(bridge, { body: ping })).body!).result.who).toBe('first');
  });

  it('says to open the app when no page is running it', async () => {
    const bridge = createAgentBridge(fakeSocket().socket);
    const response = JSON.parse((await request(bridge, { body: ping })).body!);
    expect(response.id).toBe(7);
    expect(response.error.message).toMatch(/^No page is running the application/);
    expect(bridge.connected).toBe(false);
  });

  it('answers a notification with 202, with or without a page', async () => {
    const bridge = createAgentBridge(fakeSocket().socket);
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect((await request(bridge, { body })).status).toBe(202);
  });

  it('refuses browser pages, takes only POST, and leaves every other path alone', async () => {
    const bridge = createAgentBridge(fakeSocket().socket);
    expect((await request(bridge, { body: ping, headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await request(bridge, { method: 'GET' })).status).toBe(405);
    expect((await request(bridge, { body: '{nope' })).status).toBe(400);
    expect((await request(bridge, { url: '/src/main.ts' })).passed).toBe(true);
  });

  it('tells the agent when the page never answers', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, { timeoutMs: 10 });
    emit(EVENTS.ready, {}, { send: () => {} });
    const response = JSON.parse((await request(bridge, { body: ping })).body!);
    expect(response.error.message).toMatch(/did not answer/);
  });
});

describe('the shell, in a dev server', () => {
  const SHELL =
    "import { createApp } from 'gesso-framework';\ncreateApp({ history: { mode: 'path' } }).mount('#app');\n";

  it('hands the app to the bridge, whatever the shell does with it next', () => {
    const out = transformShell(SHELL, { entries: null, overlay: false, agent: true })!;
    expect(out).toContain("__gessoAgent(createApp(__gessoOptions({ history: { mode: 'path' } }))).mount('#app');");
    expect(out).toContain("import('gesso-framework/agent')");
    expect(out).toContain('webmcp: true,');
  });

  it('writes no bridge for a build', () => {
    expect(transformShell(SHELL, { entries: null, overlay: false })).toBeNull();
  });
});

describe('a single-thread shell, in a dev server', () => {
  const SYNC =
    "import { createSyncApp } from 'gesso-framework';\nimport { App } from './App';\n\ncreateSyncApp(App).useWebMcp(false).mountSync('#app');\n";

  it('hands the builder to the bridge, before the chain the app wrote', () => {
    const out = transformSyncShell(SYNC)!;
    expect(out).toContain("__gessoAgent(createSyncApp(App)).useWebMcp(false).mountSync('#app');");
    // On by default, and the app's own useWebMcp(false), later in the chain, still decides.
    expect(out).toContain('app.useWebMcp(true);');
  });

  it('leaves a module that does not create a single-thread app alone, and does not wrap twice', () => {
    expect(transformSyncShell("import { createSyncApp } from './elsewhere';\ncreateSyncApp(App);\n")).toBeNull();
    expect(transformSyncShell(transformSyncShell(SYNC)!)).toBeNull();
  });
});

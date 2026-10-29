import { describe, expect, it } from 'vitest';

import {
  AGENT_PATH,
  connectLines,
  createAgentBridge,
  EVENTS,
  type BridgeClient,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeSocket,
  type RememberedPage
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

describe('the lines to connect an agent', () => {
  it('give the endpoint, and the line to add it in each agent, under the name asked for', () => {
    const url = 'http://localhost:5173/__gesso/mcp';
    expect(connectLines('my-app', url).split('\n')).toEqual([
      `  ➜  Agents:  ${url}  (MCP, as my-app)`,
      `             claude mcp add --transport http my-app ${url}`,
      `             codex mcp add my-app --url ${url}`,
      `             gemini mcp add --transport http my-app ${url}`
    ]);
  });
});

describe("the server's own tools", () => {
  const local = {
    tools: [{ name: 'library_overview' }],
    call: async (name: string) => ({ content: [{ type: 'text', text: `answered ${name} here` }], isError: false }),
    instructions: 'Read the components first.'
  };
  const rpc = (id: number, method: string, params: Record<string, unknown> = {}) =>
    JSON.stringify({ jsonrpc: '2.0', id, method, params });

  it('answers the handshake, the listing and its own calls with no page open', async () => {
    const bridge = createAgentBridge(fakeSocket().socket, { local });

    const hello = JSON.parse(
      (await request(bridge, { body: rpc(1, 'initialize', { protocolVersion: '2025-06-18' }) })).body!
    );
    const listed = JSON.parse((await request(bridge, { body: rpc(2, 'tools/list') })).body!);
    const called = JSON.parse(
      (await request(bridge, { body: rpc(3, 'tools/call', { name: 'library_overview', arguments: {} }) })).body!
    );

    expect(hello.result.protocolVersion).toBe('2025-06-18');
    expect(hello.result.instructions).toBe('Read the components first.');
    expect(listed.result.tools).toEqual([{ name: 'library_overview' }]);
    expect(called).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: { content: [{ type: 'text', text: 'answered library_overview here' }], isError: false }
    });
  });

  it("lists its tools after the page's and joins the instructions, and sends the page everything else", async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, { local });
    const seen: string[] = [];
    emit(
      EVENTS.ready,
      {},
      fakePage(emit, message => {
        const { id, method } = message as { id: number; method: string };
        // What the bridge asks for itself as the page connects is not the agent's.
        if (!String(id).startsWith('gesso:')) {
          seen.push(method);
        }
        if (method === 'initialize') {
          return { jsonrpc: '2.0', id, result: { instructions: 'The page.' } };
        }
        if (method === 'tools/list') {
          return { jsonrpc: '2.0', id, result: { tools: [{ name: 'ui_snapshot' }] } };
        }
        return { jsonrpc: '2.0', id, result: { content: [], isError: false } };
      })
    );

    const hello = JSON.parse((await request(bridge, { body: rpc(1, 'initialize') })).body!);
    const listed = JSON.parse((await request(bridge, { body: rpc(2, 'tools/list') })).body!);
    await request(bridge, { body: rpc(3, 'tools/call', { name: 'ui_snapshot' }) });
    await request(bridge, { body: rpc(4, 'tools/call', { name: 'library_overview' }) });

    expect(hello.result.instructions).toBe('The page.\n\nRead the components first.');
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['ui_snapshot', 'library_overview']);
    expect(seen).toEqual(['initialize', 'tools/list', 'tools/call']);
  });

  it('still says no page is open for what only a page can answer', async () => {
    const bridge = createAgentBridge(fakeSocket().socket, { local });
    const answer = JSON.parse((await request(bridge, { body: rpc(1, 'tools/call', { name: 'ui_snapshot' }) })).body!);
    expect(answer.error.message).toContain('No page is running the application.');
  });
});

describe('the agent endpoint', () => {
  it('relays a message to the page that announced itself, and answers with what the page said', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket);
    const seen: unknown[] = [];
    emit(
      EVENTS.ready,
      {},
      fakePage(emit, message => {
        if (!String((message as { id: unknown }).id).startsWith('gesso:')) {
          seen.push(message);
        }
        return { jsonrpc: '2.0', id: 7, result: {} };
      })
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

  it('gives a call of a tool that waits on purpose as long as the page listed, and any other its own limit', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, { timeoutMs: 10 });
    const page: BridgeClient = {
      send: (event, payload) => {
        if (event !== EVENTS.request) {
          return;
        }
        const { id, message } = payload as { id: number; message: { id: number; method: string } };
        const reply = (result: unknown) =>
          emit(EVENTS.response, { id, response: { jsonrpc: '2.0', id: message.id, result } }, page);
        if (message.method === 'tools/list') {
          queueMicrotask(() =>
            reply({ tools: [{ name: 'wait_for_task', _meta: { 'gesso/waitsUpToMs': 500 } }, { name: 'measure' }] })
          );
        } else {
          setTimeout(() => reply({ content: [{ type: 'text', text: 'here' }], isError: false }), 40);
        }
      }
    };
    emit(EVENTS.ready, {}, page);
    const call = (name: string) =>
      JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: {} } });
    await request(bridge, { body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} }) });
    expect(JSON.parse((await request(bridge, { body: call('wait_for_task') })).body!).result.content[0].text).toBe(
      'here'
    );
    expect(JSON.parse((await request(bridge, { body: call('measure') })).body!).error.message).toMatch(
      /did not answer/
    );
  });

  it('tells the agent at once when the page it asked closes, rather than when its wait would end', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, { timeoutMs: 60_000 });
    const page: BridgeClient = { send: () => {} };
    emit(EVENTS.ready, {}, page);
    const answer = request(bridge, { body: ping });
    await Promise.resolve();
    emit('vite:ws:disconnect', {}, page);
    expect(JSON.parse((await answer).body!).error.message).toMatch(/closed before it answered/);
  });

  it('hears a page close as Vite 6 and later say it, and as Vite 5 did', async () => {
    for (const event of ['vite:client:disconnect', 'vite:ws:disconnect']) {
      const { socket, emit } = fakeSocket();
      const bridge = createAgentBridge(socket, { timeoutMs: 60_000 });
      const page: BridgeClient = { send: () => {} };
      emit(EVENTS.ready, {}, page);
      emit(event, {}, page);
      expect(bridge.connected).toBe(false);
      expect(JSON.parse((await request(bridge, { body: ping })).body!).error.message).toMatch(/No page is running/);
    }
  });

  it('tells the agent when the page never answers', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, { timeoutMs: 10 });
    emit(EVENTS.ready, {}, { send: () => {} });
    const response = JSON.parse((await request(bridge, { body: ping })).body!);
    expect(response.error.message).toMatch(/did not answer/);
  });
});

describe('a page that cannot answer', () => {
  const rpc = (id: number, method: string, params: Record<string, unknown> = {}) =>
    JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const call = (name: string) => rpc(9, 'tools/call', { name, arguments: {} });

  /** A page that takes each request as it arrives, then answers it after `delay`, and lists `atelier_view`. */
  function receivingPage(emit: ReturnType<typeof fakeSocket>['emit'], delay = 0, quiet = () => false) {
    const page: BridgeClient = {
      send: (event, payload) => {
        if (event !== EVENTS.request || quiet()) {
          return;
        }
        const { id, message } = payload as { id: number; message: { id: number; method: string } };
        emit(EVENTS.received, { id }, page);
        const result =
          message.method === 'tools/list'
            ? { tools: [{ name: 'atelier_view' }] }
            : message.method === 'initialize'
              ? { instructions: 'Read the board first.' }
              : { content: [{ type: 'text', text: 'the board' }], isError: false };
        setTimeout(
          () => emit(EVENTS.response, { id, response: { jsonrpc: '2.0', id: message.id, result } }, page),
          delay
        );
      }
    };
    return page;
  }

  it("still lists the page's tools once it has gone, and a call of one says no window is open", async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket);
    const page = receivingPage(emit);
    emit(EVENTS.ready, {}, page);
    await request(bridge, { body: rpc(1, 'initialize') });
    await request(bridge, { body: rpc(2, 'tools/list') });
    emit('vite:client:disconnect', {}, page);

    const hello = JSON.parse((await request(bridge, { body: rpc(3, 'initialize') })).body!);
    expect(hello.result.instructions).toBe('Read the board first.');
    const listed = JSON.parse((await request(bridge, { body: rpc(4, 'tools/list') })).body!);
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['atelier_view']);
    const answer = JSON.parse((await request(bridge, { body: call('atelier_view') })).body!);
    expect(answer.result.isError).toBe(true);
    expect(answer.result.content[0].text).toMatch(/No window of the app is open to answer atelier_view/);
    // A tool it never listed is still not one.
    expect(JSON.parse((await request(bridge, { body: call('nope') })).body!).error.message).toMatch(
      /No page is running/
    );
  });

  it('asks a page what it offers as it connects, so its tools are listed once it goes though no agent asked', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket);
    const page = receivingPage(emit);
    emit(EVENTS.ready, {}, page);
    await new Promise(resolve => setTimeout(resolve, 5));
    emit('vite:client:disconnect', {}, page);
    const listed = JSON.parse((await request(bridge, { body: rpc(1, 'tools/list') })).body!);
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['atelier_view']);
    const hello = JSON.parse((await request(bridge, { body: rpc(2, 'initialize') })).body!);
    expect(hello.result.instructions).toBe('Read the board first.');
  });

  it('keeps what the page listed for the next server, which lists it before any page connects', async () => {
    let kept: RememberedPage | undefined;
    const memory = { read: () => kept, write: (page: RememberedPage) => (kept = page) };
    const first = fakeSocket();
    const page = receivingPage(first.emit);
    const bridge = createAgentBridge(first.socket, { memory });
    first.emit(EVENTS.ready, {}, page);
    await request(bridge, { body: rpc(1, 'tools/list') });
    expect(kept?.tools.map(tool => tool.name)).toEqual(['atelier_view']);

    const restarted = createAgentBridge(fakeSocket().socket, { memory });
    const listed = JSON.parse((await request(restarted, { body: rpc(2, 'tools/list') })).body!);
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['atelier_view']);
  });

  it('says in moments that a page that takes requests has gone quiet, and waits on one that took it', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, { timeoutMs: 60_000, receiveTimeoutMs: 20 });
    let paused = false;
    const page = receivingPage(emit, 40, () => paused);
    emit(EVENTS.ready, {}, page);
    // Taken, and answered after longer than the quiet limit: waited for.
    expect(JSON.parse((await request(bridge, { body: call('atelier_view') })).body!).result.content[0].text).toBe(
      'the board'
    );
    paused = true;
    const started = Date.now();
    const answer = JSON.parse((await request(bridge, { body: call('atelier_view') })).body!);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(answer.result.isError).toBe(true);
    expect(answer.result.content[0].text).toMatch(/did not take atelier_view .* hidden or minimised/);
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

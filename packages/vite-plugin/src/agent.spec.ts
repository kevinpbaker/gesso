import { describe, expect, it } from 'vitest';

import {
  AGENT_PATH,
  connectLines,
  createAgentBridge,
  EVENTS,
  OPERATE_BEFORE_PAGE,
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
): Promise<{ status: number; body: string | undefined; passed: boolean; headers: Record<string, string> }> {
  return new Promise(resolve => {
    const headers: Record<string, string> = {};
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
      setHeader: (name, value) => (headers[name.toLowerCase()] = value),
      end: body => resolve({ status: res.statusCode, body, passed: false, headers })
    };
    bridge.middleware(req, res, () => resolve({ status: 0, body: undefined, passed: true, headers }));
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
    // No page has ever answered, so the agent is told what it will get once one does.
    expect(hello.result.instructions).toBe(`${OPERATE_BEFORE_PAGE}\n\nRead the components first.`);
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

  it("offers the application's prompts itself, with a page open or not, and says it has them as an agent connects", async () => {
    const prompts = [
      {
        name: 'draw',
        description: 'Draw a problem',
        arguments: [{ name: 'problem', required: true }],
        text: 'Draw this: {{problem}}'
      }
    ];
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, { local: { ...local, prompts } });
    const ask = async (id: number, method: string, params: Record<string, unknown> = {}) =>
      JSON.parse((await request(bridge, { body: rpc(id, method, params) })).body!);

    expect((await ask(1, 'initialize')).result.capabilities).toEqual({
      tools: { listChanged: true },
      resources: {},
      prompts: {}
    });
    expect((await ask(2, 'prompts/list')).result.prompts).toEqual([
      { name: 'draw', description: 'Draw a problem', arguments: [{ name: 'problem', required: true }] }
    ]);

    const asked: string[] = [];
    emit(
      EVENTS.ready,
      {},
      fakePage(emit, message => {
        const { id, method } = message as { id: number; method: string };
        if (!String(id).startsWith('gesso:')) asked.push(method);
        return {
          jsonrpc: '2.0',
          id,
          result: method === 'initialize' ? { capabilities: { tools: {}, resources: {} } } : { tools: [] }
        };
      })
    );
    expect((await ask(3, 'initialize')).result.capabilities).toEqual({
      tools: { listChanged: true },
      resources: {},
      prompts: {}
    });
    expect((await ask(4, 'prompts/get', { name: 'draw', arguments: { problem: 'a ladder' } })).result.messages).toEqual(
      [{ role: 'user', content: { type: 'text', text: 'Draw this: a ladder' } }]
    );
    expect((await ask(5, 'prompts/get', { name: 'draw' })).error.message).toBe('The prompt draw needs problem.');
    // The page is asked only for the handshake: the prompts are the server's.
    expect(asked).toEqual(['initialize']);
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

  it('refuses a tool call its gate refuses, before the page sees it, and lets the rest through', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, {
      gate: tool => (tool === 'paid_tool' ? 'This project needs a license for agents.' : undefined)
    });
    const seen: string[] = [];
    emit(
      EVENTS.ready,
      {},
      fakePage(emit, message => {
        const { id, params } = message as { id: unknown; params?: { name?: string } };
        if (!String(id).startsWith('gesso:') && params?.name !== undefined) {
          seen.push(params.name);
        }
        return { jsonrpc: '2.0', id: 3, result: { content: [] } };
      })
    );

    const call = (name: string) =>
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: {} } });
    const refused = JSON.parse((await request(bridge, { body: call('paid_tool') })).body!);
    expect(refused.result).toEqual({
      content: [{ type: 'text', text: 'This project needs a license for agents.' }],
      isError: true
    });
    await request(bridge, { body: call('free_tool') });
    expect(seen).toEqual(['free_tool']);
  });

  it("refuses a page tool's call its local check refuses, before the page sees it", async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, {
      local: {
        tools: [],
        call: () => Promise.reject(new Error('none')),
        check: (name, args) =>
          name === 'render_frame' && args?.inputs === undefined ? Promise.resolve('Pill needs label.') : undefined
      }
    });
    const seen: unknown[] = [];
    emit(
      EVENTS.ready,
      {},
      fakePage(emit, message => {
        const { id, params } = message as { id: unknown; params?: { arguments?: unknown } };
        if (!String(id).startsWith('gesso:')) seen.push(params?.arguments);
        return { jsonrpc: '2.0', id: 4, result: { content: [] } };
      })
    );

    const call = (args: object) =>
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'render_frame', arguments: args }
      });
    const refused = JSON.parse((await request(bridge, { body: call({ module: 'src/Pill' }) })).body!);
    expect(refused.result).toEqual({ content: [{ type: 'text', text: 'Pill needs label.' }], isError: true });
    await request(bridge, { body: call({ module: 'src/Pill', inputs: { label: 'Open' } }) });
    expect(seen).toEqual([{ module: 'src/Pill', inputs: { label: 'Open' } }]);
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

  it('answers at the paths it is given, and leaves the default alone when not given it', async () => {
    const bridge = createAgentBridge(fakeSocket().socket, { paths: ['/__app/mcp', AGENT_PATH] });
    expect((await request(bridge, { url: '/__app/mcp', method: 'GET' })).status).toBe(405);
    expect((await request(bridge, { url: `${AGENT_PATH}?x=1`, method: 'GET' })).status).toBe(405);

    const only = createAgentBridge(fakeSocket().socket, { paths: ['/__app/mcp'] });
    expect((await request(only, { url: AGENT_PATH })).passed).toBe(true);
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

describe('which agent is asking', () => {
  const rpc = (id: number, method: string, params: Record<string, unknown> = {}) =>
    JSON.stringify({ jsonrpc: '2.0', id, method, params });

  it("tells the page the name the agent's session began with, and never a name the call gave itself", async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket);
    const seen: unknown[] = [];
    const page = fakePage(emit, message => {
      seen.push(message);
      return { jsonrpc: '2.0', id: (message as { id: unknown }).id, result: {} };
    });
    emit(EVENTS.ready, {}, page);

    const hello = await request(bridge, {
      body: rpc(1, 'initialize', { clientInfo: { name: 'Claude Code', version: '2' } })
    });
    const session = hello.headers['mcp-session-id'];
    expect(session).toMatch(/^[0-9a-f]{32}$/);

    await request(bridge, {
      body: rpc(2, 'tools/call', { name: 'notes_remove', arguments: {}, _meta: { 'gesso/agent': 'The person' } }),
      headers: { 'mcp-session-id': session }
    });
    await request(bridge, {
      body: rpc(3, 'tools/call', { name: 'notes_remove', arguments: {}, _meta: { 'gesso/agent': 'The person' } })
    });
    const calls = seen.filter(message => (message as { method: string }).method === 'tools/call') as {
      params: { _meta: Record<string, unknown> };
    }[];
    expect(calls.map(call => call.params._meta['gesso/agent'])).toEqual(['Claude Code', undefined]);

    expect((await request(bridge, { method: 'DELETE', headers: { 'mcp-session-id': session } })).status).toBe(204);
  });
});

describe("the server's name", () => {
  const rpc = (id: number, method: string, params: Record<string, unknown> = {}) =>
    JSON.stringify({ jsonrpc: '2.0', id, method, params });

  it('is the one the dev server printed, before a page connects and after, and a first agent is not refused', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket, { name: 'expenses' });

    const before = JSON.parse((await request(bridge, { body: rpc(1, 'initialize') })).body!);
    expect(before.result.serverInfo.name).toBe('expenses');
    expect(before.result.instructions).toBe(OPERATE_BEFORE_PAGE);

    const page = fakePage(emit, message => ({
      jsonrpc: '2.0',
      id: (message as { id: unknown }).id,
      result: { serverInfo: { name: 'Expenses: a tab title', version: '1' }, instructions: 'The page.' }
    }));
    emit(EVENTS.ready, {}, page);
    const after = JSON.parse((await request(bridge, { body: rpc(2, 'initialize') })).body!);
    expect(after.result.serverInfo).toEqual({ name: 'expenses', version: '1' });
    expect(after.result.instructions).toBe('The page.');
  });
});

describe('what the dev server says unasked', () => {
  it('tells an open event stream when a page with other tools answers', async () => {
    const { socket, emit } = fakeSocket();
    const bridge = createAgentBridge(socket);
    const hello = await request(bridge, {
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'Claude Code' } }
      })
    });
    const session = hello.headers['mcp-session-id'];
    const written: string[] = [];
    const closers: (() => void)[] = [];
    const req: BridgeRequest = {
      method: 'GET',
      url: AGENT_PATH,
      headers: { 'mcp-session-id': session, accept: 'text/event-stream' },
      on: ((event: string, listener: () => void) => {
        if (event === 'close') closers.push(listener);
      }) as BridgeRequest['on']
    };
    const res: BridgeResponse = {
      statusCode: 0,
      setHeader: () => {},
      end: () => written.push('(ended)'),
      write: chunk => written.push(chunk)
    };
    bridge.middleware(req, res, () => written.push('(passed on)'));
    expect(res.statusCode).toBe(200);

    let tools = [{ name: 'notes_view' }];
    const page = fakePage(emit, message => {
      const { id, method } = message as { id: unknown; method: string };
      return { jsonrpc: '2.0', id, result: method === 'tools/list' ? { tools } : {} };
    });
    emit(EVENTS.ready, {}, page);
    await new Promise(resolve => setTimeout(resolve, 0));
    emit(EVENTS.ready, {}, page);
    await new Promise(resolve => setTimeout(resolve, 0));
    tools = [{ name: 'notes_view' }, { name: 'notes_add' }];
    emit(EVENTS.ready, {}, page);
    await new Promise(resolve => setTimeout(resolve, 0));

    const said = written.filter(chunk => chunk.startsWith('event: message'));
    expect(said).toEqual([
      `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })}\n\n`,
      `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })}\n\n`
    ]);
    closers.forEach(close => close());
  });
});

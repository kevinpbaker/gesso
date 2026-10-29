/**
 * The dev server's half of the agent bridge: MCP at `/__gesso/mcp`.
 *
 * An agent such as Claude Code connects to an MCP server by URL, and
 * the dev server already has one. But the channels it should offer live
 * in the page's workers, and a server cannot reach a worker. The page
 * can, and it holds a socket to the server already, Vite's HMR
 * connection. So this relays: each JSON-RPC message an agent posts goes
 * down that socket to the page, `connectDevAgent` in `gesso-framework/agent`
 * answers it against the render worker, and the answer comes back up
 * and out as the HTTP response.
 *
 * MCP is spoken in the page rather than here, so this file imports
 * nothing from the framework and parses nothing but enough JSON to
 * know a request from a notification.
 *
 * Several tabs may be open. The newest to announce itself answers,
 * which is the one a person most likely means, and a tab that closes
 * hands back to the one before it.
 *
 * A few tools are the server's own: the component catalog, which the
 * checker reads here and which an agent should be able to read before
 * any page is open. Those are answered here, and listed alongside the
 * page's; everything else still goes to the page.
 *
 * A page that cannot answer is said to be one, rather than let the
 * agent wait or wonder. The tools the page last listed are remembered
 * (across a restart too, given `memory`), so with no page open they are
 * still listed, and a call of one says no page is open to answer it.
 * And a page takes each request as it arrives (`received`), so one that
 * has gone quiet, a window hidden and paused by its browser, is said to
 * be in moments, not when the call would have timed out.
 */

/** The path an agent is pointed at. */
export const AGENT_PATH = '/__gesso/mcp';

/** The HMR events, as `connectDevAgent` names them. */
export const EVENTS = {
  ready: 'gesso:agent:ready',
  request: 'gesso:agent:request',
  /** The page has a request and is answering it. */
  received: 'gesso:agent:received',
  response: 'gesso:agent:response'
} as const;

/** The part of a Vite HMR client this uses. */
export interface BridgeClient {
  send(event: string, payload?: unknown): void;
}

/** The part of `server.ws` this uses. */
export interface BridgeSocket {
  on(event: string, listener: (data: never, client: BridgeClient) => void): void;
}

/** A request as Connect hands it over, read without Node's types. */
export interface BridgeRequest {
  readonly method?: string;
  readonly url?: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  on(event: 'data', listener: (chunk: { toString(): string }) => void): unknown;
  on(event: 'end' | 'error', listener: () => void): unknown;
}

/** A response as Connect hands it over. */
export interface BridgeResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export interface AgentBridgeOptions {
  /**
   * How long a call may take before the agent is told it timed out, in
   * milliseconds (default 130 000): a command marked `@confirm` waits
   * for a person, and people are slow.
   */
  timeoutMs?: number;
  /** Tools the server answers itself, page or no page. */
  local?: LocalTools;
  /**
   * How long a page that says it takes requests may go without taking
   * one, in milliseconds (default 10 000), before the agent is told it
   * has gone quiet.
   */
  receiveTimeoutMs?: number;
  /** Where what the page last listed is kept, so a restarted server still lists its tools. */
  memory?: PageMemory;
}

/** What a page last told an agent about itself: its tools, and its instructions. */
export interface RememberedPage {
  readonly tools: readonly { readonly name: string }[];
  readonly instructions?: string;
}

/** Keeps what a page last listed beyond one bridge: across a dev server's restarts. */
export interface PageMemory {
  read(): RememberedPage | undefined;
  write(page: RememberedPage): void;
}

/** Tools the dev server answers without the page: see the file's comment. */
export interface LocalTools {
  /** Each in the shape MCP's `tools/list` returns. */
  readonly tools: readonly { readonly name: string }[];
  /** Answers one, in the shape MCP's `tools/call` returns. */
  call(name: string, args: Readonly<Record<string, unknown>> | undefined): Promise<unknown>;
  /** Added to what the page tells an agent when it connects. */
  readonly instructions?: string;
}

export interface AgentBridge {
  /** Connect middleware: answers `AGENT_PATH`, passes everything else on. */
  middleware(request: BridgeRequest, response: BridgeResponse, next: () => void): void;
  /** Whether a page has announced itself. */
  readonly connected: boolean;
}

/** What a request sent to a page that went away is answered with, before it is said to the agent. */
const PAGE_GONE = Symbol('page gone');

export function createAgentBridge(socket: BridgeSocket, options: AgentBridgeOptions = {}): AgentBridge {
  const timeoutMs = options.timeoutMs ?? 130_000;
  const receiveTimeoutMs = options.receiveTimeoutMs ?? 10_000;
  const local = options.local;
  const localNames = new Set(local?.tools.map(tool => tool.name) ?? []);
  /** Pages that announced themselves, newest last. */
  const pages: BridgeClient[] = [];
  const pending = new Map<
    number,
    { readonly page: BridgeClient; readonly resolve: (response: unknown) => void; received?: () => void }
  >();
  /** Pages that say when they take a request: one that goes quiet is waited on only `receiveTimeoutMs`. */
  const receiving = new WeakSet<BridgeClient>();
  /** What a page last listed, said for it while none is open. */
  let remembered: { tools: readonly { readonly name: string }[]; instructions?: string } = options.memory?.read() ?? {
    tools: []
  };
  let next = 1;
  /**
   * How long each tool the page listed says it may wait, under MCP's
   * `_meta` as `gesso/waitsUpToMs` (gesso-framework's `WAITS_UP_TO`):
   * a call of one is given that long, and a moment more, where any other
   * is given `timeoutMs`.
   */
  const waits = new Map<string, number>();

  socket.on(EVENTS.ready, (_data, client) => {
    const at = pages.indexOf(client);
    if (at >= 0) {
      pages.splice(at, 1);
    }
    pages.push(client);
  });
  socket.on('vite:ws:disconnect', (_data, client) => {
    const at = pages.indexOf(client);
    if (at >= 0) {
      pages.splice(at, 1);
    }
    // What was asked of a page that has gone (closed, or reloaded) is
    // never answered: said so now, so the agent asks again, rather than
    // when a tool that waits on purpose would have given up.
    for (const [id, waiting] of pending) {
      if (waiting.page === client) {
        pending.delete(id);
        waiting.resolve(PAGE_GONE);
      }
    }
  });
  socket.on(EVENTS.received, (data: { id: number }, client) => {
    receiving.add(client);
    pending.get(data.id)?.received?.();
  });
  socket.on(EVENTS.response, (data: { id: number; response: unknown }) => {
    const waiting = pending.get(data.id);
    if (waiting !== undefined) {
      pending.delete(data.id);
      waiting.resolve(data.response);
    }
  });

  /**
   * The answer the server gives itself, or undefined to relay. A call
   * to one of its own tools is always answered here; with no page open,
   * so are the handshake and the listings, so an agent connected before
   * the page still reads the catalog, and still sees the page's tools,
   * as it last listed them, each saying no page is open to answer it.
   */
  const answerHere = (message: unknown): Promise<unknown> | undefined => {
    const request = asRequest(message);
    if (request === undefined) {
      return undefined;
    }
    const { id, method, params } = request;
    if (
      local !== undefined &&
      method === 'tools/call' &&
      typeof params.name === 'string' &&
      localNames.has(params.name)
    ) {
      const args = params.arguments as Readonly<Record<string, unknown>> | undefined;
      return local.call(params.name, args).then(result => ({ jsonrpc: '2.0', id, result }));
    }
    if (pages.length > 0) {
      return undefined;
    }
    const pageTools = remembered.tools.filter(tool => !localNames.has(tool.name));
    if (local === undefined && pageTools.length === 0) {
      return undefined;
    }
    const instructions = [remembered.instructions, local?.instructions].filter(
      (text): text is string => text !== undefined && text !== ''
    );
    switch (method) {
      case 'initialize':
        return Promise.resolve({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: 'gesso', version: '0.0.0' },
            ...(instructions.length === 0 ? {} : { instructions: instructions.join('\n\n') })
          }
        });
      case 'tools/list':
        return Promise.resolve({ jsonrpc: '2.0', id, result: { tools: [...(local?.tools ?? []), ...pageTools] } });
      case 'tools/call':
        if (typeof params.name === 'string' && pageTools.some(tool => tool.name === params.name)) {
          return Promise.resolve(
            failed(
              id,
              `No window of the app is open to answer ${params.name}: it was closed, or it is reloading (a page ` +
                'that lost the dev server reconnects when it comes back). Open the app from this dev server, or ' +
                `bring its window forward and reload it if it is blank, then call ${params.name} again.`
            )
          );
        }
        return undefined;
      case 'ping':
        return Promise.resolve({ jsonrpc: '2.0', id, result: {} });
      case 'resources/list':
        return Promise.resolve({ jsonrpc: '2.0', id, result: { resources: [] } });
      case 'resources/templates/list':
        return Promise.resolve({ jsonrpc: '2.0', id, result: { resourceTemplates: [] } });
      default:
        return undefined;
    }
  };

  const relay = (message: unknown): Promise<unknown> => {
    const page = pages[pages.length - 1];
    const id = next++;
    const request = asRequest(message);
    const tool =
      request?.method === 'tools/call' && typeof request.params.name === 'string' ? request.params.name : null;
    const called = tool === null ? undefined : waits.get(tool);
    const limit = called === undefined ? timeoutMs : Math.max(timeoutMs, called + 10_000);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(rpcError(message, -32001, `The page did not answer within ${Math.round(limit / 1000)} seconds.`));
      }, limit);
      // A page that takes requests and has not taken this one is not
      // running: a window hidden or minimised, which its browser pauses,
      // or one stuck. Said in moments, rather than at the limit.
      const quiet = receiving.has(page)
        ? setTimeout(() => {
            pending.delete(id);
            clearTimeout(timer);
            const text =
              `The app's window did not take ${tool ?? 'the request'} within ${Math.round(receiveTimeoutMs / 1000)} ` +
              'seconds: it is most likely hidden or minimised, and paused by its browser, or it is stuck. Bring the ' +
              `window forward (reload it if it is blank), then call ${tool ?? 'again'}${tool === null ? '' : ' again'}.`;
            resolve(
              request === undefined || tool === null ? rpcError(message, -32001, text) : failed(request.id, text)
            );
          }, receiveTimeoutMs)
        : undefined;
      pending.set(id, {
        page,
        received: () => clearTimeout(quiet),
        resolve: response => {
          clearTimeout(timer);
          clearTimeout(quiet);
          if (response === PAGE_GONE) {
            resolve(
              rpcError(message, -32001, 'The page closed before it answered (it may have reloaded); call again.')
            );
            return;
          }
          if (request?.method === 'tools/list') {
            noteWaits(response);
            remember({ tools: listed(response) });
          }
          if (request?.method === 'initialize') {
            const instructions = (response as { result?: { instructions?: unknown } } | null)?.result?.instructions;
            remember({ instructions: typeof instructions === 'string' ? instructions : undefined });
          }
          resolve(response);
        }
      });
      page.send(EVENTS.request, { id, message });
    });
  };

  /** Keeps what a page said of itself, for while none is open. */
  const remember = (part: {
    tools?: readonly { readonly name: string }[];
    instructions?: string | undefined;
  }): void => {
    const instructions = 'instructions' in part ? part.instructions : remembered.instructions;
    const now = { tools: part.tools ?? remembered.tools, ...(instructions === undefined ? {} : { instructions }) };
    if (JSON.stringify(now) === JSON.stringify(remembered)) {
      return;
    }
    remembered = now;
    try {
      options.memory?.write(now);
    } catch {
      // Kept in memory still; only a restart forgets it.
    }
  };

  const noteWaits = (response: unknown): void => {
    const tools = (response as { result?: { tools?: unknown } } | null)?.result?.tools;
    if (!Array.isArray(tools)) {
      return;
    }
    for (const tool of tools as { name?: unknown; _meta?: Record<string, unknown> }[]) {
      const wait = tool._meta?.['gesso/waitsUpToMs'];
      if (typeof tool.name === 'string' && typeof wait === 'number') {
        waits.set(tool.name, wait);
      }
    }
  };

  return {
    get connected() {
      return pages.length > 0;
    },
    middleware(request, response, next) {
      if (request.url?.split('?')[0] !== AGENT_PATH) {
        next();
        return;
      }
      // An agent is not a browser and sends no Origin. A page that does
      // could be any site the person has open, reaching for a server on
      // their own machine; the transport says to refuse it.
      if (request.headers.origin !== undefined) {
        send(response, 403, 'text/plain', 'The agent endpoint does not take requests from browser pages.');
        return;
      }
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST');
        send(response, 405, 'text/plain', 'POST JSON-RPC messages here.');
        return;
      }
      let body = '';
      request.on('data', chunk => {
        body += chunk.toString();
      });
      request.on('end', () => {
        let message: unknown;
        try {
          message = JSON.parse(body);
        } catch {
          send(response, 400, 'application/json', JSON.stringify(rpcError(null, -32700, 'The body is not JSON.')));
          return;
        }
        const notification = typeof message === 'object' && message !== null && !('id' in message);
        const own = answerHere(message);
        if (own !== undefined) {
          void own.then(answer => send(response, 200, 'application/json', JSON.stringify(answer)));
          return;
        }
        if (pages.length === 0) {
          if (notification) {
            send(response, 202);
            return;
          }
          send(
            response,
            200,
            'application/json',
            JSON.stringify(
              rpcError(
                message,
                -32000,
                'No page is running the application. Open it in a browser from this dev server; the agent bridge ' +
                  'runs in the page, because that is where the channels are.'
              )
            )
          );
          return;
        }
        void relay(message)
          .then(answer => (local === undefined ? answer : mergeLocal(message, answer, local)))
          .then(answer => {
            if (answer === null || answer === undefined) {
              send(response, 202);
            } else {
              send(response, 200, 'application/json', JSON.stringify(answer));
            }
          });
      });
    }
  };
}

function send(response: BridgeResponse, status: number, type?: string, body?: string): void {
  response.statusCode = status;
  if (type !== undefined) {
    response.setHeader('content-type', type);
  }
  response.end(body);
}

/** A tool call that could not be made, as MCP says one: a result marked as an error, which the agent reads. */
function failed(id: string | number | null, text: string): unknown {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
}

/** The tools a page's `tools/list` answer lists, or none. */
function listed(response: unknown): readonly { readonly name: string }[] {
  const tools = (response as { result?: { tools?: unknown } } | null)?.result?.tools;
  return Array.isArray(tools)
    ? (tools as unknown[]).filter(
        (tool): tool is { name: string } => typeof (tool as { name?: unknown })?.name === 'string'
      )
    : [];
}

function rpcError(message: unknown, code: number, text: string): unknown {
  const id = (message as { id?: unknown } | null)?.id;
  return {
    jsonrpc: '2.0',
    id: typeof id === 'string' || typeof id === 'number' ? id : null,
    error: { code, message: text }
  };
}

/**
 * What the shell module gets in a dev server: the app, handed to the
 * page's half of the bridge once `gesso-framework/agent` has loaded.
 * Loaded on demand, so the page pays for it only in development.
 */
export const SHELL_BRIDGE = `function __gessoAgent(app) {
  if (typeof app.useWebMcp === 'function') {
    // A single-thread builder: on by default here, as \`webmcp: true\`
    // is for createApp, and a later useWebMcp(false) still decides.
    app.useWebMcp(true);
  }
  if (import.meta.hot) {
    void import('gesso-framework/agent').then(({ connectDevAgent }) => connectDevAgent(app, import.meta.hot));
  }
  return app;
}
`;

/** A JSON-RPC request, with an id and params, or undefined for anything else. */
function asRequest(
  message: unknown
): { id: string | number; method: string; params: Record<string, unknown> } | undefined {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return undefined;
  }
  const { id, method, params } = message as { id?: unknown; method?: unknown; params?: unknown };
  if ((typeof id !== 'string' && typeof id !== 'number') || typeof method !== 'string') {
    return undefined;
  }
  return {
    id,
    method,
    params: typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {}
  };
}

/**
 * The page's answer with the server's own tools in it: listed after the
 * page's, and the instructions joined, so an agent sees one server.
 */
function mergeLocal(message: unknown, answer: unknown, local: LocalTools): unknown {
  const method = asRequest(message)?.method;
  const result = (answer as { result?: Record<string, unknown> } | null)?.result;
  if (result === undefined || (method !== 'tools/list' && method !== 'initialize')) {
    return answer;
  }
  if (method === 'tools/list' && Array.isArray(result.tools)) {
    const taken = new Set((result.tools as { name?: unknown }[]).map(tool => tool.name));
    const added = local.tools.filter(tool => !taken.has(tool.name));
    return { ...(answer as object), result: { ...result, tools: [...result.tools, ...added] } };
  }
  if (method === 'initialize' && local.instructions !== undefined) {
    const given = typeof result.instructions === 'string' ? `${result.instructions}\n\n` : '';
    return { ...(answer as object), result: { ...result, instructions: `${given}${local.instructions}` } };
  }
  return answer;
}

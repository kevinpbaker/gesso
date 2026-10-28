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
 */

/** The path an agent is pointed at. */
export const AGENT_PATH = '/__gesso/mcp';

/** The HMR events, as `connectDevAgent` names them. */
export const EVENTS = {
  ready: 'gesso:agent:ready',
  request: 'gesso:agent:request',
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

export function createAgentBridge(socket: BridgeSocket, options: AgentBridgeOptions = {}): AgentBridge {
  const timeoutMs = options.timeoutMs ?? 130_000;
  const local = options.local;
  const localNames = new Set(local?.tools.map(tool => tool.name) ?? []);
  /** Pages that announced themselves, newest last. */
  const pages: BridgeClient[] = [];
  const pending = new Map<number, (response: unknown) => void>();
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
  });
  socket.on(EVENTS.response, (data: { id: number; response: unknown }) => {
    const resolve = pending.get(data.id);
    if (resolve !== undefined) {
      pending.delete(data.id);
      resolve(data.response);
    }
  });

  /**
   * The answer the server gives itself, or undefined to relay. A call
   * to one of its own tools is always answered here; with no page open,
   * so are the handshake and the listings, so an agent connected before
   * the page still reads the catalog.
   */
  const answerWithLocal = (message: unknown): Promise<unknown> | undefined => {
    const request = asRequest(message);
    if (request === undefined || local === undefined) {
      return undefined;
    }
    const { id, method, params } = request;
    if (method === 'tools/call' && typeof params.name === 'string' && localNames.has(params.name)) {
      const args = params.arguments as Readonly<Record<string, unknown>> | undefined;
      return local.call(params.name, args).then(result => ({ jsonrpc: '2.0', id, result }));
    }
    if (pages.length > 0) {
      return undefined;
    }
    switch (method) {
      case 'initialize':
        return Promise.resolve({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: 'gesso', version: '0.0.0' },
            ...(local.instructions === undefined ? {} : { instructions: local.instructions })
          }
        });
      case 'tools/list':
        return Promise.resolve({ jsonrpc: '2.0', id, result: { tools: local.tools } });
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
    const called =
      request?.method === 'tools/call' && typeof request.params.name === 'string'
        ? waits.get(request.params.name)
        : undefined;
    const limit = called === undefined ? timeoutMs : Math.max(timeoutMs, called + 10_000);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(rpcError(message, -32001, `The page did not answer within ${Math.round(limit / 1000)} seconds.`));
      }, limit);
      pending.set(id, response => {
        clearTimeout(timer);
        if (request?.method === 'tools/list') {
          noteWaits(response);
        }
        resolve(response);
      });
      page.send(EVENTS.request, { id, message });
    });
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
        const own = local === undefined ? undefined : answerWithLocal(message);
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

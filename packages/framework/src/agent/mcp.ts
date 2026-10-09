import type { AgentSurfaceLike } from './AgentSurface';

/**
 * An agent surface, served over the Model Context Protocol.
 *
 * Two layers. `handleMcpMessage` answers one JSON-RPC message and knows
 * nothing about how it arrived, which is all a stdio transport or a
 * relay needs. `mcpHandler` wraps it in MCP's Streamable HTTP
 * transport as a `fetch`-style function, `(Request) => Response`,
 * which is what `Bun.serve`, Deno, a service worker and every modern
 * Node server framework take, so the framework imports no server.
 *
 * What it implements is the part a channel needs: `initialize`, `ping`,
 * `tools/list`, `tools/call`, `resources/list` and `resources/read`.
 * Responses are plain JSON rather than an event stream, which the
 * transport allows, and the GET stream for server-initiated messages
 * is declined with 405, which it also allows: nothing here sends one,
 * so the capabilities say neither `listChanged` nor `subscribe`.
 *
 * `mcpHandler` keeps sessions, as the transport describes: `initialize`
 * is answered with an `Mcp-Session-Id`, the client sends it back on
 * every request after, and `DELETE` with it ends the session. A session
 * remembers the client's `clientInfo`, so an application can tell one
 * agent from another while a request runs (`McpHandlerOptions.around`).
 * A request without a session, or with one the server has forgotten, is
 * still answered, as one from an unknown caller.
 */

/** The protocol revisions this server speaks, newest first. */
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

export interface McpServerInfo {
  /** The name a client shows for this server. Defaults to `gesso`. */
  name?: string;
  version?: string;
  /** Told to the agent on connecting: what this application is, in a sentence or two. */
  instructions?: string;
}

type JsonRpcId = string | number;

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id?: JsonRpcId;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: '2.0'; id: JsonRpcId | null; error: { code: number; message: string } };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
/** MCP's code for a resource that does not exist. */
const RESOURCE_NOT_FOUND = -32002;

/**
 * Answers one JSON-RPC message. Returns null for a notification, which
 * takes no answer, and never throws: a malformed message is answered
 * with the JSON-RPC error that says what was wrong with it.
 */
export async function handleMcpMessage(
  surface: AgentSurfaceLike,
  message: unknown,
  info: McpServerInfo = {}
): Promise<JsonRpcResponse | null> {
  if (!isRequest(message)) {
    return error(null, INVALID_REQUEST, 'Expected a JSON-RPC 2.0 request with a method.');
  }
  if (message.id === undefined) {
    // `notifications/initialized` and `notifications/cancelled` are the
    // ones a client sends. Neither needs anything from a server whose
    // every call answers before the next is read.
    return null;
  }
  const { id } = message;
  const params = message.params ?? {};
  switch (message.method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      const version = MCP_PROTOCOL_VERSIONS.find(supported => supported === asked) ?? MCP_PROTOCOL_VERSIONS[0];
      return ok(id, {
        protocolVersion: version,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: info.name ?? 'gesso', version: info.version ?? '0.0.0' },
        ...(info.instructions === undefined ? {} : { instructions: info.instructions })
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: await surface.tools() });
    case 'tools/call': {
      if (typeof params.name !== 'string') {
        return error(id, INVALID_PARAMS, 'tools/call needs the name of a tool.');
      }
      const args = params.arguments;
      if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) {
        return error(id, INVALID_PARAMS, 'tools/call arguments must be an object.');
      }
      return ok(id, await surface.call(params.name, args as Record<string, unknown> | undefined));
    }
    case 'resources/list':
      return ok(id, { resources: await surface.resources() });
    case 'resources/templates/list':
      return ok(id, { resourceTemplates: [] });
    case 'resources/read': {
      const uri = params.uri;
      const view = typeof uri === 'string' ? await surface.read(uri) : undefined;
      if (typeof uri !== 'string' || view === undefined) {
        return error(id, RESOURCE_NOT_FOUND, `No resource at ${String(uri)}.`);
      }
      return ok(id, { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(view) }] });
    }
    default:
      return error(id, METHOD_NOT_FOUND, `This server does not implement ${message.method}.`);
  }
}

/**
 * Who sent a request: the session `initialize` began, and the client it
 * said it was. Handed to `McpHandlerOptions.around` for each request.
 */
export interface McpCaller {
  /** The session's id, as sent in `Mcp-Session-Id`. */
  readonly session: string;
  /** The order sessions began in since the handler was made, from 1: a short way to tell two of one client apart. */
  readonly number: number;
  /** What the client said it was in `initialize`'s `clientInfo`; an empty name when it said nothing. */
  readonly client: { readonly name: string; readonly version: string };
}

/** The most sessions remembered at once; the oldest is forgotten first, and its requests are then from an unknown caller. */
const MAX_SESSIONS = 256;

export interface McpHandlerOptions extends McpServerInfo {
  /**
   * Origins a browser may call from. A request carrying any other
   * `Origin` is refused, as the transport requires: without it, a web
   * page the person happens to have open could reach a server bound to
   * their own machine and send commands to their application. Agents
   * that are not browsers send no `Origin` and are unaffected.
   */
  allowedOrigins?: readonly string[];
  /**
   * A secret every request must carry as `Authorization: Bearer
   * <token>`. Worth setting whenever the port is reachable by anything
   * other than the person's own agents.
   */
  token?: string;
  /**
   * Runs around every request, told who sent it: the session and the
   * client it belongs to, or null for a request outside any session. A
   * place to keep the caller in an `AsyncLocalStorage`, say, so the
   * commands a tool call runs can tell which agent asked:
   *
   *   around: (caller, handle) => agents.run(caller, handle)
   *
   * It must call `handle` and return what it returns.
   */
  around?: (caller: McpCaller | null, handle: () => Promise<JsonRpcResponse | null>) => Promise<JsonRpcResponse | null>;
}

/**
 * The Streamable HTTP transport, as a `fetch` handler.
 *
 *   Bun.serve({ hostname: '127.0.0.1', port: 7310, fetch: mcpHandler(surface, { name: 'notes' }) });
 *
 * It answers every path; mount it where the server routes `/mcp`.
 */
export function mcpHandler(
  surface: AgentSurfaceLike,
  options: McpHandlerOptions = {}
): (request: Request) => Promise<Response> {
  const sessions = new Map<string, McpCaller>();
  let begun = 0;
  return async request => {
    const origin = request.headers.get('origin');
    if (origin !== null && !(options.allowedOrigins ?? []).includes(origin)) {
      return text(403, `Requests from ${origin} are not allowed.`);
    }
    if (
      options.token !== undefined &&
      !sameText(request.headers.get('authorization') ?? '', `Bearer ${options.token}`)
    ) {
      return text(401, 'This server needs a bearer token.');
    }
    const sessionId = request.headers.get('mcp-session-id');
    if (request.method === 'DELETE' && sessionId !== null) {
      sessions.delete(sessionId);
      return new Response(null, { status: 204 });
    }
    const version = request.headers.get('mcp-protocol-version');
    if (version !== null && !(MCP_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
      return text(400, `Unsupported MCP protocol version ${version}.`);
    }
    if (request.method !== 'POST') {
      // GET is the optional stream for messages the server starts. There
      // are no such messages, and 405 is how the transport says so.
      return new Response(null, { status: 405, headers: { allow: 'POST, DELETE' } });
    }
    let message: unknown;
    try {
      message = await request.json();
    } catch {
      return json(400, error(null, PARSE_ERROR, 'The body is not JSON.'));
    }
    // `initialize` begins a session; anything else belongs to the one it names, if it is known.
    let started: McpCaller | null = null;
    if (isRequest(message) && message.method === 'initialize' && message.id !== undefined) {
      const info = (message.params?.clientInfo ?? {}) as { name?: unknown; version?: unknown };
      started = {
        session: newSessionId(),
        number: ++begun,
        client: {
          name: typeof info.name === 'string' ? info.name : '',
          version: typeof info.version === 'string' ? info.version : ''
        }
      };
      sessions.set(started.session, started);
      if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
    }
    const caller = started ?? (sessionId === null ? null : (sessions.get(sessionId) ?? null));
    const handle = () => handleMcpMessage(surface, message, options);
    const response = await (options.around === undefined ? handle() : options.around(caller, handle));
    if (response === null) return new Response(null, { status: 202 });
    const answered = json(200, response);
    if (started !== null) answered.headers.set('mcp-session-id', started.session);
    return answered;
  };
}

/** A session id no one can guess: 128 random bits, as hex. */
function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Whether two strings are the same, taking as long however early they
 * differ, so a token cannot be guessed a character at a time from how
 * quickly it is refused.
 */
function sameText(a: string, b: string): boolean {
  let differs = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) differs |= (a.charCodeAt(i % Math.max(a.length, 1)) || 0) ^ b.charCodeAt(i);
  return differs === 0;
}

function isRequest(message: unknown): message is JsonRpcRequest {
  const candidate = message as Partial<JsonRpcRequest> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    candidate.jsonrpc === '2.0' &&
    typeof candidate.method === 'string'
  );
}

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function error(id: JsonRpcId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

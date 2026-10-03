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
  return async request => {
    const origin = request.headers.get('origin');
    if (origin !== null && !(options.allowedOrigins ?? []).includes(origin)) {
      return text(403, `Requests from ${origin} are not allowed.`);
    }
    if (options.token !== undefined && request.headers.get('authorization') !== `Bearer ${options.token}`) {
      return text(401, 'This server needs a bearer token.');
    }
    const version = request.headers.get('mcp-protocol-version');
    if (version !== null && !(MCP_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
      return text(400, `Unsupported MCP protocol version ${version}.`);
    }
    if (request.method !== 'POST') {
      // GET is the optional stream for messages the server starts, and
      // DELETE ends a session. There are no such messages and no
      // sessions, and 405 is how the transport says so.
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    }
    let message: unknown;
    try {
      message = await request.json();
    } catch {
      return json(400, error(null, PARSE_ERROR, 'The body is not JSON.'));
    }
    const response = await handleMcpMessage(surface, message, options);
    return response === null ? new Response(null, { status: 202 }) : json(200, response);
  };
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

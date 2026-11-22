import {
  FULL_GRANT,
  grantAllows,
  grantedSurface,
  PROTECTED_RESOURCE_PATH,
  protectedResourceMetadata,
  protectedResourceMetadataUrl,
  scopeOf,
  type AgentGrant,
  type McpOAuthOptions
} from './auth';
import type { AgentCallContext, AgentSurfaceLike } from './AgentSurface';

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
 * `tools/list`, `tools/call`, `resources/list` and `resources/read`,
 * and `prompts/list` and `prompts/get` for an application's prompts.
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

/**
 * The `_meta` key on a relayed `tools/call` that names the agent, for a
 * relay that keeps the session and passes the message on (the dev
 * server's bridge to the page). Read only when the caller is not passed
 * in, so an agent talking to `mcpHandler` cannot name itself another.
 */
export const AGENT_META = 'gesso/agent';

/**
 * How to operate a Gesso application, told to every agent on
 * `initialize` after the application's own instructions. The tools say
 * what each one does; this says how they fit, which an agent otherwise
 * learns by calling them in the wrong order.
 */
export const OPERATE_INSTRUCTIONS =
  "To operate this app: read a channel's <channel>_view tool first. It holds what the app holds, which is what the " +
  'person sees. Each command tool answers with the view after it has taken effect, so there is no need to read it ' +
  'again; an answer that says the view is the same as before means the command had nothing to act on. A query tool ' +
  "(read-only, beside the commands) reads data without changing the person's screen; prefer it to a command that " +
  'filters or scrolls when all you want is to read. For anything no channel covers, ui_snapshot reads the screen as ' +
  'an outline, and ui_press, ui_type, ui_focus and ui_key act on it as the person would. Some commands and controls ' +
  'ask the person first and wait for their answer; when they decline, do not ask again unless they say so.';

/** The protocol revisions this server speaks, newest first. */
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

export interface McpServerInfo {
  /** The name a client shows for this server. Defaults to `gesso`. */
  name?: string;
  version?: string;
  /** Told to the agent on connecting: what this application is, in a sentence or two. */
  instructions?: string;
  /**
   * Whether the agent is also told how to operate a Gesso application
   * (`OPERATE_INSTRUCTIONS`), after `instructions`. Default true; false
   * for a server whose tools are not an application's channels.
   */
  operate?: boolean;
  /**
   * Prompts the person can run in their agent, which most agents offer
   * as slash commands: the application's ways of working, ready to use,
   * so the person need not know how to ask for them.
   */
  prompts?: readonly AgentPrompt[];
}

/**
 * A prompt an application offers: a message to its agent, written once
 * and run by the person with what they fill in.
 *
 *   { name: 'draw_problem', description: 'Draw a diagram for a problem',
 *     arguments: [{ name: 'problem', required: true }],
 *     text: 'Draw a diagram for this problem: {{problem}}' }
 */
export interface AgentPrompt {
  /** How it is run: `draw_problem`, shown as `/draw_problem` in most agents. */
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  /** What the person fills in when they run it. */
  readonly arguments?: readonly { readonly name: string; readonly description?: string; readonly required?: boolean }[];
  /** The message it sends, `{{name}}` standing for an argument's value, and for nothing where it is left out. */
  readonly text: string;
}

/** The prompts as MCP's `prompts/list` gives them: everything but their text. */
export function listedPrompts(prompts: readonly AgentPrompt[] = []): readonly Omit<AgentPrompt, 'text'>[] {
  return prompts.map(({ text: _text, ...listed }) => listed);
}

/**
 * A prompt as MCP's `prompts/get` gives it, with the arguments put in,
 * or why it cannot be: no such prompt, or an argument it needs left out.
 */
export function promptMessages(
  prompts: readonly AgentPrompt[] = [],
  name: unknown,
  args: unknown
): { readonly result: unknown } | { readonly error: string } {
  const prompt = prompts.find(p => p.name === name);
  if (prompt === undefined) {
    const names = prompts.map(p => p.name);
    return {
      error: `There is no prompt ${String(name)}.${names.length === 0 ? '' : ` The prompts are ${names.join(', ')}.`}`
    };
  }
  const given =
    typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const missing = (prompt.arguments ?? []).filter(
    a => a.required === true && (given[a.name] === undefined || String(given[a.name]).trim() === '')
  );
  if (missing.length > 0)
    return { error: `The prompt ${prompt.name} needs ${missing.map(a => a.name).join(' and ')}.` };
  const text = prompt.text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, key: string) =>
    given[key] === undefined ? '' : String(given[key])
  );
  return {
    result: {
      ...(prompt.description === undefined ? {} : { description: prompt.description }),
      messages: [{ role: 'user', content: { type: 'text', text } }]
    }
  };
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
const INTERNAL_ERROR = -32603;
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
  info: McpServerInfo = {},
  context?: AgentCallContext
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
  try {
    return await answerRequest(surface, id, message, info, context);
  } catch (failure) {
    // Never throws: whatever goes wrong reading a listing or a view is said as the JSON-RPC error for it.
    return error(id, INTERNAL_ERROR, failure instanceof Error ? failure.message : String(failure));
  }
}

/** One request answered: what `handleMcpMessage` does once it knows the message is a request, not a notification. */
async function answerRequest(
  surface: AgentSurfaceLike,
  id: JsonRpcId,
  message: JsonRpcRequest,
  info: McpServerInfo,
  context: AgentCallContext | undefined
): Promise<JsonRpcResponse> {
  const params = message.params ?? {};
  switch (message.method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      const version = MCP_PROTOCOL_VERSIONS.find(supported => supported === asked) ?? MCP_PROTOCOL_VERSIONS[0];
      return ok(id, {
        protocolVersion: version,
        capabilities: { tools: {}, resources: {}, ...((info.prompts ?? []).length === 0 ? {} : { prompts: {} }) },
        serverInfo: { name: info.name ?? 'gesso', version: info.version ?? '0.0.0' },
        ...instructionsOf(info)
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
      // A tool that fails (its thread threw, or its answer could not be sent back) is the agent's to hear about,
      // as a tool error it can read, not a request left unanswered.
      try {
        return ok(
          id,
          await surface.call(
            params.name,
            args as Record<string, unknown> | undefined,
            context ?? relayedContext(params)
          )
        );
      } catch (failure) {
        const said = failure instanceof Error ? failure.message : String(failure);
        return ok(id, { content: [{ type: 'text', text: `${params.name} failed: ${said}` }], isError: true });
      }
    }
    case 'resources/list':
      return ok(id, { resources: await surface.resources() });
    case 'resources/templates/list':
      return ok(id, { resourceTemplates: [] });
    case 'prompts/list':
      return ok(id, { prompts: listedPrompts(info.prompts) });
    case 'prompts/get': {
      const got = promptMessages(info.prompts, params.name, params.arguments);
      return 'error' in got ? error(id, INVALID_PARAMS, got.error) : ok(id, got.result);
    }
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
  /** What this request may do, from `authorize` (or the one `token`); everything when neither is set. */
  readonly grant?: AgentGrant;
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
   * other than the person's own agents. It grants every scope; for
   * agents allowed some tools and not others, use `authorize`.
   */
  token?: string;
  /**
   * Decides what each request may do, from the request itself (its
   * `Authorization` header, as a rule): an `AgentGrant`, or null to
   * refuse it with a 401. A grant's scopes decide which tools and
   * resources the agent is listed and may call; see `AgentGrant`.
   * Checking a token (its signature, that its audience is this
   * resource, that it has not expired) is this function's job.
   *
   *   authorize: async request => {
   *     const claims = await verifyAccessToken(request.headers.get('authorization'));
   *     return claims === null ? null : { subject: claims.sub, scopes: claims.scope.split(' ') };
   *   }
   */
  authorize?: (request: Request) => AgentGrant | null | Promise<AgentGrant | null>;
  /**
   * Where agents get a token, for MCP's authorization flow. With it, a
   * refused request's 401 points at this server's protected resource
   * metadata (RFC 9728), which is answered at `PROTECTED_RESOURCE_PATH`.
   */
  oauth?: McpOAuthOptions;
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
  const challenge =
    options.oauth === undefined
      ? 'Bearer'
      : `Bearer resource_metadata="${protectedResourceMetadataUrl(options.oauth.resource)}"`;
  return async request => {
    const origin = request.headers.get('origin');
    if (origin !== null && !(options.allowedOrigins ?? []).includes(origin)) {
      return text(403, `Requests from ${origin} are not allowed.`);
    }
    // Where to get a token is said to anyone: it is how an agent without one learns to ask.
    if (
      options.oauth !== undefined &&
      request.method === 'GET' &&
      new URL(request.url).pathname.startsWith(PROTECTED_RESOURCE_PATH)
    ) {
      return json(200, await protectedResourceMetadata(surface, options.oauth));
    }
    let grant: AgentGrant = FULL_GRANT;
    if (options.authorize !== undefined) {
      const given = await options.authorize(request);
      if (given === null) {
        return text(401, 'This server needs a valid access token.', { 'www-authenticate': challenge });
      }
      grant = given;
    } else if (
      options.token !== undefined &&
      !sameText(request.headers.get('authorization') ?? '', `Bearer ${options.token}`)
    ) {
      return text(401, 'This server needs a bearer token.', { 'www-authenticate': challenge });
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
    const session = started ?? (sessionId === null ? null : (sessions.get(sessionId) ?? null));
    const caller = session === null ? null : { ...session, grant };
    // A call of a tool the grant does not hold is refused as the transport says: 403, naming the scope to ask for.
    if (
      !grant.scopes.includes('*') &&
      isRequest(message) &&
      message.method === 'tools/call' &&
      typeof message.params?.name === 'string'
    ) {
      const tool = (await surface.tools()).find(each => each.name === message.params!.name);
      const scope = tool === undefined ? undefined : scopeOf(tool);
      if (!grantAllows(grant, scope)) {
        return json(
          403,
          error(
            message.id ?? null,
            INVALID_REQUEST,
            `Calling ${tool!.name} needs the scope ${scope}, which this token does not have.`
          ),
          {
            'www-authenticate': `Bearer error="insufficient_scope", scope="${scope}"${options.oauth === undefined ? '' : `, resource_metadata="${protectedResourceMetadataUrl(options.oauth.resource)}"`}`
          }
        );
      }
    }
    const context: AgentCallContext = caller === null || caller.client.name === '' ? {} : { agent: caller.client.name };
    const handle = () => handleMcpMessage(grantedSurface(surface, grant), message, options, context);
    const response = await (options.around === undefined ? handle() : options.around(caller, handle));
    if (response === null) return new Response(null, { status: 202 });
    const answered = json(200, response);
    if (started !== null) answered.headers.set('mcp-session-id', started.session);
    return answered;
  };
}

/** What an agent is told on connecting: the application's own words, then how to operate it. */
function instructionsOf(info: McpServerInfo): { instructions?: string } {
  const parts = [info.instructions, info.operate === false ? undefined : OPERATE_INSTRUCTIONS].filter(
    (part): part is string => part !== undefined && part !== ''
  );
  return parts.length === 0 ? {} : { instructions: parts.join('\n\n') };
}

/** The caller a relay named in `_meta`, or an unknown one. */
function relayedContext(params: Record<string, unknown>): AgentCallContext {
  const meta = params._meta;
  const agent = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>)[AGENT_META] : undefined;
  return typeof agent === 'string' && agent !== '' ? { agent } : {};
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

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function text(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers } });
}

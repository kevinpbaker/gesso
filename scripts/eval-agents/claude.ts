/**
 * What both halves of the agent eval share: running `claude` and reading
 * what it printed, and calling one MCP tool the way a checker does.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/** The longest one `claude` run is given before it is stopped. */
export const RUN_TIMEOUT_MS = 8 * 60_000;

/** One MCP tool call's structured result, or null when the endpoint has no such tool yet. */
export async function mcpTool(url: string, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const post = async (body: object, session?: string) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(session ? { 'mcp-session-id': session } : {})
      },
      body: JSON.stringify(body)
    });
    return {
      session: response.headers.get('mcp-session-id') ?? session,
      json: (await response.json()) as Record<string, any>
    };
  };
  const init = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'eval-checker', version: '1' } }
  });
  const call = await post(
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
    init.session ?? undefined
  );
  const result = call.json.result;
  if (result === undefined || result.isError === true) return null;
  return result.structuredContent ?? null;
}

/** Runs `claude`, keeping every line it prints in the transcript, and returns them. */
export function runClaude(args: string[], cwd: string, transcript: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err = (err + chunk).slice(-4000)));
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    child.on('exit', code => {
      clearTimeout(timer);
      writeFileSync(transcript, out);
      const lines = out.split('\n').filter(line => line.trim() !== '');
      if (!lines.some(line => line.includes('"type":"result"'))) {
        reject(new Error(`claude exited ${code} without a result${err.trim() === '' ? '' : `: ${err.trim()}`}`));
      } else {
        resolve(lines);
      }
    });
  });
}

/** What a run's stream says: its tool calls, its cost, its answer, and whether its MCP server ever came up. */
export function parse(lines: readonly string[]) {
  const tools: Record<string, number> = {};
  let toolErrors = 0;
  let mcpProblem: string | undefined;
  let result: Record<string, any> = {};
  for (const line of lines) {
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'system' && event.subtype === 'init') {
      const down = (event.mcp_servers ?? []).filter((server: { status: string }) => server.status !== 'connected');
      if (down.length > 0) mcpProblem = `MCP server not connected: ${JSON.stringify(down)}`;
    }
    for (const part of event.message?.content ?? []) {
      if (event.type === 'assistant' && part.type === 'tool_use') tools[part.name] = (tools[part.name] ?? 0) + 1;
      if (event.type === 'user' && part.type === 'tool_result' && part.is_error === true) toolErrors++;
    }
    if (event.type === 'result') result = event;
  }
  const usage = result.usage ?? {};
  return {
    tools,
    toolCalls: Object.values(tools).reduce((a, b) => a + b, 0),
    toolErrors,
    inputTokens:
      (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens ?? 0,
    costUsd: result.total_cost_usd ?? 0,
    durationMs: result.duration_ms ?? 0,
    turns: result.num_turns ?? 0,
    answer: typeof result.result === 'string' ? result.result : '',
    mcpProblem
  };
}

/** One JSON-RPC request to an MCP endpoint, in a session of its own: the result, or undefined on an error. */
export async function mcpRequest(url: string, method: string, params: Record<string, unknown> = {}): Promise<any> {
  const post = async (body: object, session?: string | null) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(session ? { 'mcp-session-id': session } : {})
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body })
    });
    return { session: response.headers.get('mcp-session-id'), json: (await response.json()) as Record<string, any> };
  };
  const init = await post({
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'eval-checker', version: '1' } }
  });
  return (await post({ method, params }, init.session)).json.result;
}

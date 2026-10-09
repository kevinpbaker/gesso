import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { agentSurface } from './AgentSurface';
import { handleMcpMessage, mcpHandler } from './mcp';

const Counter = defineChannel('counter', { view: { count: 0 }, commands: {} as { add(by: number): void } });

function surface() {
  const count = new BehaviorSubject(0);
  return agentSurface(
    [serve(Counter, { view: { count }, commands: { add: (by: number) => count.next(count.value + by) } })],
    { quietMs: 1, settleMs: 50 }
  );
}

const rpc = (id: number, method: string, params?: object) => ({ jsonrpc: '2.0', id, method, params });

describe('handleMcpMessage', () => {
  it('agrees a protocol version, offering its newest when the client asks for one it does not know', async () => {
    const known = await handleMcpMessage(surface(), rpc(1, 'initialize', { protocolVersion: '2025-06-18' }), {
      name: 'counter-app',
      instructions: 'A counter.'
    });
    expect(known).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'counter-app', version: '0.0.0' },
        instructions: 'A counter.'
      }
    });
    const unknown = await handleMcpMessage(surface(), rpc(2, 'initialize', { protocolVersion: '1999-01-01' }));
    expect((unknown as { result: { protocolVersion: string } }).result.protocolVersion).toBe('2025-11-25');
  });

  it('lists and calls tools, and reads resources', async () => {
    const s = surface();
    const tools = (await handleMcpMessage(s, rpc(1, 'tools/list'))) as { result: { tools: { name: string }[] } };
    expect(tools.result.tools.map(tool => tool.name)).toEqual(['counter_view', 'counter_add']);

    const call = (await handleMcpMessage(
      s,
      rpc(2, 'tools/call', { name: 'counter_add', arguments: { arguments: [2] } })
    )) as { result: { structuredContent: unknown } };
    expect(call.result.structuredContent).toEqual({ count: 2 });

    const read = await handleMcpMessage(s, rpc(3, 'resources/read', { uri: 'gesso://counter/view' }));
    expect(read).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: { contents: [{ uri: 'gesso://counter/view', mimeType: 'application/json', text: '{"count":2}' }] }
    });
  });

  it('answers a notification with nothing, and anything malformed with the JSON-RPC error for it', async () => {
    expect(await handleMcpMessage(surface(), { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect(await handleMcpMessage(surface(), { hello: 'there' })).toMatchObject({ error: { code: -32600 } });
    expect(await handleMcpMessage(surface(), rpc(1, 'prompts/list'))).toMatchObject({ error: { code: -32601 } });
    expect(await handleMcpMessage(surface(), rpc(1, 'tools/call', {}))).toMatchObject({ error: { code: -32602 } });
    expect(await handleMcpMessage(surface(), rpc(1, 'resources/read', { uri: 'gesso://x/view' }))).toMatchObject({
      error: { code: -32002 }
    });
  });
});

describe('mcpHandler', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('http://127.0.0.1:7310/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });

  it('answers a request with JSON and a notification with 202', async () => {
    const handler = mcpHandler(surface());
    const response = await handler(post(rpc(1, 'ping')));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} });

    expect((await handler(post({ jsonrpc: '2.0', method: 'notifications/initialized' }))).status).toBe(202);
  });

  it('refuses a browser origin it was not told about, so a web page cannot drive the app', async () => {
    const handler = mcpHandler(surface(), { allowedOrigins: ['http://localhost:5173'] });
    expect((await handler(post(rpc(1, 'ping'), { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await handler(post(rpc(1, 'ping'), { origin: 'http://localhost:5173' }))).status).toBe(200);
  });

  it('wants the bearer token when it has one', async () => {
    const handler = mcpHandler(surface(), { token: 'sesame' });
    expect((await handler(post(rpc(1, 'ping')))).status).toBe(401);
    expect((await handler(post(rpc(1, 'ping'), { authorization: 'Bearer sesame' }))).status).toBe(200);
  });

  it('begins a session at initialize, and tells around who sent each request after', async () => {
    const seen: (string | null)[] = [];
    const handler = mcpHandler(surface(), {
      around: (caller, handle) => {
        seen.push(caller === null ? null : `${caller.client.name} ${caller.client.version} #${caller.number}`);
        return handle();
      }
    });
    const first = await handler(
      post(rpc(1, 'initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code', version: '2.1' } }))
    );
    const session = first.headers.get('mcp-session-id')!;
    expect(session).toMatch(/^[0-9a-f]{32}$/);
    const second = await handler(post(rpc(1, 'initialize', { clientInfo: { name: 'claude-code', version: '2.1' } })));
    expect(second.headers.get('mcp-session-id')).not.toBe(session);

    await handler(
      post(rpc(2, 'tools/call', { name: 'counter_add', arguments: { arguments: [1] } }), { 'mcp-session-id': session })
    );
    await handler(post(rpc(3, 'ping')));
    await handler(post(rpc(4, 'ping'), { 'mcp-session-id': 'forgotten' }));
    expect(seen).toEqual(['claude-code 2.1 #1', 'claude-code 2.1 #2', 'claude-code 2.1 #1', null, null]);

    expect(
      (await handler(new Request('http://127.0.0.1/mcp', { method: 'DELETE', headers: { 'mcp-session-id': session } })))
        .status
    ).toBe(204);
    await handler(post(rpc(5, 'ping'), { 'mcp-session-id': session }));
    expect(seen.at(-1)).toBeNull();
  });

  it('refuses a token that differs anywhere, or in length', async () => {
    const handler = mcpHandler(surface(), { token: 'sesame' });
    for (const wrong of ['Bearer sesamE', 'Bearer sesam', 'Bearer sesame!', '', 'sesame']) {
      expect((await handler(post(rpc(1, 'ping'), { authorization: wrong }))).status).toBe(401);
    }
  });

  it('declines the server-sent stream, a protocol it does not speak, and a body that is not JSON', async () => {
    const handler = mcpHandler(surface());
    expect((await handler(new Request('http://127.0.0.1/mcp', { method: 'GET' }))).status).toBe(405);
    expect((await handler(post(rpc(1, 'ping'), { 'mcp-protocol-version': '2024-01-01' }))).status).toBe(400);
    const garbled = await handler(post('{not json'));
    expect(garbled.status).toBe(400);
    expect(await garbled.json()).toMatchObject({ error: { code: -32700 } });
  });
});

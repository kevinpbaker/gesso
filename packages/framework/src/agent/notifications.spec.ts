import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { agentSurface, type AgentSurfaceChange, type AgentSurfaceLike } from './AgentSurface';
import { combineSurfaces } from './remote';
import { mcpHandler } from './mcp';

const Counter = defineChannel('counter', { view: { count: 0 }, commands: {} as { add(): void } });
const Clock = defineChannel('clock', { view: { now: 0 } });

function app() {
  const count = new BehaviorSubject(0);
  const now = new BehaviorSubject(0);
  const surface = agentSurface(
    [
      serve(Counter, { view: { count }, commands: { add: () => count.next(count.value + 1) } }),
      serve(Clock, { view: { now } })
    ],
    { quietMs: 1, settleMs: 20 }
  );
  return { surface, count, now };
}

/** Reads server-sent events from a response until `count` messages have come. */
async function messages(response: Response, count: number): Promise<{ method: string; params?: { uri?: string } }[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const out: { method: string; params?: { uri?: string } }[] = [];
  let buffered = '';
  while (out.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffered.indexOf('\n\n')) >= 0) {
      const event = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      const data = event.split('\n').find(line => line.startsWith('data: '));
      if (data !== undefined) out.push(JSON.parse(data.slice(6)));
    }
  }
  await reader.cancel();
  return out;
}

describe('a surface that watches', () => {
  it('says when a view changes, and a combined one passes on what each part says', () => {
    const { surface, count } = app();
    const heard: AgentSurfaceChange[] = [];
    const stop = combineSurfaces([surface]).watch!(change => heard.push(change));
    heard.length = 0;
    count.next(5);
    expect(heard).toEqual([{ type: 'resource', uri: 'gesso://counter/view' }]);
    stop();
    count.next(6);
    expect(heard).toHaveLength(1);
  });
});

describe('mcpHandler, unasked', () => {
  it('offers subscriptions, and tells a session of each change to what it subscribed to, once a burst', async () => {
    const { surface, count, now } = app();
    const handler = mcpHandler(surface);
    const post = (body: object, session?: string) =>
      handler(
        new Request('http://127.0.0.1/mcp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(session === undefined ? {} : { 'mcp-session-id': session })
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body })
        })
      );
    const hello = await post({ method: 'initialize' });
    const session = hello.headers.get('mcp-session-id')!;
    expect(((await hello.json()) as { result: { capabilities: unknown } }).result.capabilities).toEqual({
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true }
    });
    expect(
      (await (
        await post({ method: 'resources/subscribe', params: { uri: 'gesso://counter/view' } }, session)
      ).json()) as object
    ).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {}
    });
    expect(
      (
        (await (
          await post({ method: 'resources/subscribe', params: { uri: 'gesso://nope/view' } }, session)
        ).json()) as { error?: unknown }
      ).error
    ).toBeDefined();

    const stream = await handler(
      new Request('http://127.0.0.1/mcp', { method: 'GET', headers: { 'mcp-session-id': session } })
    );
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    const heard = messages(stream, 1);
    now.next(1);
    count.next(1);
    count.next(2);
    expect(await heard).toEqual([
      { jsonrpc: '2.0', method: 'notifications/resources/updated', params: { uri: 'gesso://counter/view' } }
    ]);
  });

  it('tells every open session when the tools change', async () => {
    let listener: ((change: AgentSurfaceChange) => void) | undefined;
    const changing: AgentSurfaceLike = {
      tools: () => [],
      resources: () => [],
      read: () => undefined,
      call: async () => ({ content: [], isError: false }),
      watch: heard => ((listener = heard), () => (listener = undefined))
    };
    const handler = mcpHandler(changing);
    const hello = await handler(
      new Request('http://127.0.0.1/mcp', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      })
    );
    const stream = await handler(
      new Request('http://127.0.0.1/mcp', {
        method: 'GET',
        headers: { 'mcp-session-id': hello.headers.get('mcp-session-id')! }
      })
    );
    const heard = messages(stream, 1);
    listener!({ type: 'tools' });
    expect(await heard).toEqual([{ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }]);
  });
});

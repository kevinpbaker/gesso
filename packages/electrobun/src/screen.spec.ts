import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { defineChannel, serve } from 'gesso-framework';
import { AGENT_PORT, serveAgentPort, type AgentSurfaceLike } from 'gesso-framework/agent';

import { serveDesktopAgent, type DesktopServe } from './agent';
import { createScreenAgent } from './screen';
import { relayScreenAgent } from './view';

const Counter = defineChannel('counter', { view: { count: 0 }, commands: {} as { add(by: number): void } });

/** A render worker's agent surface, as far as this needs one: a screen tool, and the channel it replicates. */
function renderWorker(pressed: string[]): AgentSurfaceLike {
  const ok = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: false });
  return {
    tools: () => [
      {
        name: 'ui_press',
        description: 'Presses a control.',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: false, openWorldHint: false }
      },
      {
        name: 'counter_view',
        description: 'The counter, replicated.',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true, openWorldHint: false }
      }
    ],
    resources: () => [],
    call: async (name, args) => {
      pressed.push(`${name} ${JSON.stringify(args)}`);
      return ok('pressed');
    },
    read: () => undefined
  };
}

function setUp() {
  const pressed: string[] = [];
  const channel = new MessageChannel();
  serveAgentPort(channel.port1, () => renderWorker(pressed));
  const screen = createScreenAgent();
  // The window's page, relaying between the main process and its render worker.
  let toMain: (message: unknown) => void = () => {};
  const relay = relayScreenAgent({ openRenderPort: key => (key === AGENT_PORT ? channel.port2 : undefined) }, message =>
    toMain(message)
  );
  const window = screen.attach(message => relay(message));
  toMain = message => window.receive(message);
  return { pressed, screen, window, channel };
}

describe('a desktop window’s screen, offered to agents', () => {
  it('lists only the screen tools, and presses through the window', async () => {
    const { pressed, screen, channel } = setUp();
    expect((await screen.surface.tools()).map(tool => tool.name)).toEqual(['ui_press']);
    const result = await screen.surface.call('ui_press', { target: 'Save' });
    expect(result.content[0]).toEqual({ type: 'text', text: 'pressed' });
    expect(pressed).toEqual(['ui_press {"target":"Save"}']);
    expect((await screen.surface.call('counter_view', {})).isError).toBe(true);
    channel.port1.close();
  });

  it('says there is no window once the last one is detached', async () => {
    const { screen, window, channel } = setUp();
    window.detach();
    expect(await screen.surface.tools()).toEqual([]);
    expect((await screen.surface.call('ui_press', {})).content[0]).toEqual({
      type: 'text',
      text: 'No window is open to operate.'
    });
    channel.port1.close();
  });

  it('is offered by serveDesktopAgent beside the channel tools', async () => {
    const { screen, channel } = setUp();
    const count = new BehaviorSubject(0);
    let fetch: ((request: Request) => Promise<Response>) | undefined;
    const fake: DesktopServe = options => {
      fetch = options.fetch;
      return { stop: () => {} };
    };
    serveDesktopAgent(
      [serve(Counter, { view: { count }, commands: { add: (by: number) => count.next(count.value + by) } })],
      {
        serve: fake,
        screen: screen.surface
      }
    );
    const response = await fetch!(
      new Request('http://127.0.0.1:7310/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      })
    );
    const names = ((await response.json()) as { result: { tools: { name: string }[] } }).result.tools.map(
      tool => tool.name
    );
    expect(names).toEqual(['counter_view', 'counter_add', 'ui_press']);
    channel.port1.close();
  });
});

import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { describeChannel } from '../channel/ChannelSchema';
import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { agentSurface, type AgentConfirmation } from './AgentSurface';
import { combineSurfaces, remoteSurface, serveAgentPort } from './remote';

const Counter = defineChannel('counter', { view: { count: 0 }, commands: {} as { add(by: number): void } });
const Clock = defineChannel('clock', { view: { now: 0 }, commands: {} });

const open: MessagePort[] = [];
afterEach(() => {
  for (const port of open.splice(0)) {
    port.close();
  }
});

/** A surface served at one end of a real MessageChannel and used from the other. */
function across(
  channels: Parameters<typeof agentSurface>[0],
  timeoutMs?: number,
  answer?: (request: AgentConfirmation) => boolean
) {
  const pair = new MessageChannel();
  open.push(pair.port1, pair.port2);
  serveAgentPort(pair.port2, confirm => agentSurface(channels, { quietMs: 1, settleMs: 50, confirm }));
  return remoteSurface(pair.port1, { timeoutMs, confirm: answer });
}

function counter() {
  const count = new BehaviorSubject(0);
  return serve(Counter, { view: { count }, commands: { add: (by: number) => count.next(count.value + by) } });
}

describe('a surface across a port', () => {
  it('lists, calls and reads exactly as it would in its own thread', async () => {
    const remote = across([counter()]);
    expect((await remote.tools()).map(tool => tool.name)).toEqual(['counter_view', 'counter_add']);
    expect((await remote.call('counter_add', { arguments: [4] })).structuredContent).toEqual({ count: 4 });
    expect(await remote.read('gesso://counter/view')).toEqual({ count: 4 });
    expect(await remote.read('gesso://nothing/view')).toBeUndefined();
    expect((await remote.resources()).map(resource => resource.uri)).toEqual(['gesso://counter/view']);
  });

  it('takes a thread that never answers as one with nothing to offer', async () => {
    const pair = new MessageChannel();
    open.push(pair.port1, pair.port2);
    const silent = remoteSurface(pair.port1, { timeoutMs: 20 });
    expect(await silent.tools()).toEqual([]);
    expect(await silent.read('gesso://counter/view')).toBeUndefined();
  });
});

describe('a command that needs a person, across a port', () => {
  const Lists = defineChannel('lists', { view: { size: 3 }, commands: {} as { clear(): void } });
  const lists = () => {
    const size = new BehaviorSubject(3);
    const served = serve(Lists, { view: { size }, commands: { clear: () => size.next(0) } });
    describeChannel(Lists, {
      view: { type: 'object', properties: { size: { type: 'number' } } },
      commands: {
        clear: { parameters: [], input: { type: 'object', properties: {} }, confirm: true, destructive: true }
      }
    });
    return { served, size };
  };

  it('asks the far end of the port, and sends the command only when the person there agrees', async () => {
    const asked: string[] = [];
    let answer = false;
    const app = lists();
    const remote = across([app.served], undefined, request => {
      asked.push(`${request.channel}.${request.command}`);
      return answer;
    });

    expect((await remote.call('lists_clear', {})).isError).toBe(true);
    expect(app.size.value).toBe(3);
    answer = true;
    expect((await remote.call('lists_clear', {})).structuredContent).toEqual({ size: 0 });
    expect(asked).toEqual(['lists.clear', 'lists.clear']);
  });

  it('takes no way to ask as a no', async () => {
    const app = lists();
    const result = await across([app.served]).call('lists_clear', {});
    expect(result.content[0].text).toContain('The person declined');
    expect(app.size.value).toBe(3);
  });
});

describe('combined surfaces', () => {
  it('lists every thread together, and sends each call to the thread that listed it', async () => {
    const now = new BehaviorSubject(1000);
    const combined = combineSurfaces([across([counter()]), across([serve(Clock, { view: { now } })])]);

    expect((await combined.tools()).map(tool => tool.name)).toEqual(['counter_view', 'counter_add', 'clock_view']);
    expect((await combined.call('clock_view', {})).structuredContent).toEqual({ now: 1000 });
    expect((await combined.call('counter_add', { arguments: [2] })).structuredContent).toEqual({ count: 2 });
    expect(await combined.read('gesso://clock/view')).toEqual({ now: 1000 });
  });

  it('finds a tool it was never asked to list', async () => {
    const combined = combineSurfaces([across([counter()])]);
    expect((await combined.call('counter_add', { arguments: [1] })).isError).toBe(false);
  });

  it('keeps the first of two tools with one name, and names a tool that is nowhere', async () => {
    const combined = combineSurfaces([across([counter()]), across([counter()])]);
    expect((await combined.tools()).map(tool => tool.name)).toEqual(['counter_view', 'counter_add']);
    expect((await combined.call('counter_fly', {})).content[0].text).toBe(
      'There is no tool called counter_fly. The tools are counter_view, counter_add.'
    );
  });
});

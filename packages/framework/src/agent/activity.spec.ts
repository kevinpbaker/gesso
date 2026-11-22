import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { describeChannel } from '../channel/ChannelSchema';
import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { AgentActivityService, describeAgentActivity, type AgentActivityEntry } from '../app/AgentActivityService';
import { outcomeOf, recordAgentActivity } from './activity';
import { serveApplicationAgent } from './app';
import { remoteSurface } from './remote';
import { agentSurface } from './AgentSurface';

const Issues = defineChannel('issues', {
  view: { titles: {} as Readonly<Record<string, string>> },
  commands: {} as { rename(id: string, title: string): void; remove(id: string): void },
  queries: {} as { count(): number }
});
describeChannel(Issues, {
  view: { type: 'object', properties: { titles: { type: 'object' } } },
  commands: {
    rename: {
      parameters: ['id', 'title'],
      input: {
        type: 'object',
        properties: { id: { type: 'string' }, title: { type: 'string' } },
        required: ['id', 'title']
      }
    },
    remove: {
      parameters: ['id'],
      input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      confirm: true
    }
  },
  queries: { count: { parameters: [], input: { type: 'object', properties: {} } } }
});

function recorded(answer: 'approved' | 'declined' = 'declined') {
  const titles = new BehaviorSubject<Readonly<Record<string, string>>>({ a: 'Login', b: 'Typo' });
  const activity = new AgentActivityService();
  const surface = recordAgentActivity(
    agentSurface(
      [
        serve(Issues, {
          view: { titles },
          commands: {
            rename: (id, title) => (id in titles.value ? titles.next({ ...titles.value, [id]: title }) : undefined),
            remove: () => {}
          },
          queries: { count: () => Object.keys(titles.value).length }
        })
      ],
      { quietMs: 1, settleMs: 20, confirm: () => answer }
    ),
    activity
  );
  return { surface, activity };
}

describe('what agents did, written down', () => {
  it('records each call that can change something, with the agent and what came of it, and no reads', async () => {
    const { surface, activity } = recorded();
    const claude = { agent: 'Claude Code' };
    await surface.call('issues_view', {}, claude);
    await surface.call('issues_count', {}, claude);
    await surface.call('issues_rename', { id: 'a', title: 'Sign-in' }, claude);
    await surface.call('issues_rename', { id: 'nope', title: 'x' }, claude);
    await surface.call('issues_remove', { id: 'b' }, claude);
    await surface.call('issues_rename', { title: 'no id' });

    expect(activity.current().map(({ tool, title, agent, outcome }) => ({ tool, title, agent, outcome }))).toEqual([
      { tool: 'issues_rename', title: 'issues: rename', agent: 'Claude Code', outcome: 'changed' },
      { tool: 'issues_rename', title: 'issues: rename', agent: 'Claude Code', outcome: 'unchanged' },
      { tool: 'issues_remove', title: 'issues: remove', agent: 'Claude Code', outcome: 'declined' },
      { tool: 'issues_rename', title: 'issues: rename', agent: undefined, outcome: 'failed' }
    ]);
    expect(activity.current()[0]).toMatchObject({ id: 1, arguments: { id: 'a', title: 'Sign-in' } });
  });

  it("is written by the application's agent port into the runtime's record, with the agent the transport named", async () => {
    const titles = new BehaviorSubject<Readonly<Record<string, string>>>({ a: 'Login' });
    const activity = new AgentActivityService();
    const pair = new MessageChannel();
    serveApplicationAgent(pair.port2, {
      channels: () => [
        serve(Issues, {
          view: { titles },
          commands: { rename: (id, title) => titles.next({ ...titles.value, [id]: title }), remove: () => {} }
        })
      ],
      workers: () => [],
      ui: () => undefined,
      activity: () => activity
    });
    await remoteSurface(pair.port1).call('issues_rename', { id: 'a', title: 'Sign-in' }, { agent: 'Codex' });
    expect(activity.current()).toMatchObject([{ agent: 'Codex', tool: 'issues_rename', outcome: 'changed' }]);
    pair.port1.close();
    pair.port2.close();
  });

  it('says what came of a call from what the call itself says, else from whether it failed', () => {
    expect(outcomeOf({ content: [], isError: false, _meta: { 'gesso/outcome': 'unasked' } })).toBe('unasked');
    expect(outcomeOf({ content: [], isError: true })).toBe('failed');
    expect(outcomeOf({ content: [], isError: false })).toBe('changed');
  });
});

describe('describeAgentActivity', () => {
  const entry = (tool: string, title: string, agent?: string, outcome: AgentActivityEntry['outcome'] = 'changed') => ({
    id: 0,
    at: 0,
    tool,
    title,
    arguments: {},
    outcome,
    ...(agent === undefined ? {} : { agent })
  });

  it('says a burst of changes as one sentence for each agent, and leaves out what changed nothing', () => {
    const burst = [
      ...Array.from({ length: 8 }, () => entry('tracker_update', 'tracker: update', 'Claude Code')),
      entry('tracker_create', 'tracker: create', 'Claude Code'),
      entry('tracker_update', 'tracker: update', 'Claude Code', 'declined'),
      entry('ui_press', 'Press a control')
    ];
    expect(describeAgentActivity(burst)).toBe(
      'Claude Code made 9 changes: update ×8, create. An AI agent made a change: press a control.'
    );
    expect(describeAgentActivity([entry('x', 'a: b', 'Claude Code', 'unchanged')])).toBe('');
  });
});

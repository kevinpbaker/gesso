import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { describeChannel } from '../channel/ChannelSchema';
import { defineChannel, type QueriesOf } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { agentSurface, resultText } from './AgentSurface';

interface Issue {
  id: string;
  title: string;
  priority: number;
}

const Issues = defineChannel('issues', {
  view: { rows: [] as readonly Issue[] },
  commands: {} as { setQuery(text: string): void },
  queries: {} as {
    find(text: string, limit?: number): readonly Issue[];
    get(id: string): Issue | null;
    count(): number;
    slow(): Promise<number>;
    broken(): number;
    internal(): string;
    loose(a: string, b: number): string;
  }
});

describeChannel(Issues, {
  view: { type: 'object', properties: { rows: { type: 'array' } } },
  commands: {
    setQuery: {
      description: "Filters the person's list.",
      parameters: ['text'],
      input: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
    }
  },
  queries: {
    find: {
      description: "Issues whose title holds the text, without changing the person's list.",
      returns: 'the matching issues, at most limit of them.',
      parameters: ['text', 'limit'],
      input: {
        type: 'object',
        properties: { text: { type: 'string' }, limit: { type: 'number' } },
        required: ['text'],
        additionalProperties: false
      }
    },
    get: {
      description: 'One issue by id, or null.',
      parameters: ['id'],
      input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
    },
    count: { description: 'How many issues there are.', parameters: [], input: { type: 'object', properties: {} } },
    slow: { parameters: [], input: { type: 'object', properties: {} } },
    broken: { parameters: [], input: { type: 'object', properties: {} } },
    internal: { parameters: [], input: { type: 'object', properties: {} }, hidden: true }
  }
});

function issuesApp() {
  const all: Issue[] = [
    { id: 'A-1', title: 'Login fails', priority: 1 },
    { id: 'A-2', title: 'Login is slow', priority: 3 },
    { id: 'A-3', title: 'Typo on the pricing page', priority: 4 }
  ];
  const rows = new BehaviorSubject<readonly Issue[]>(all.slice(0, 1));
  const served = serve(Issues, {
    view: { rows },
    commands: { setQuery: text => rows.next(all.filter(issue => issue.title.includes(text))) },
    queries: {
      find: (text, limit = 50) => all.filter(issue => issue.title.includes(text)).slice(0, limit),
      get: id => all.find(issue => issue.id === id) ?? null,
      count: () => all.length,
      // An answer that waits, though the contract declares a plain number for the other two.
      slow: () => new Promise<number>(resolve => setTimeout(() => resolve(7), 5)),
      broken: () => {
        throw new Error('the index is not built');
      },
      internal: () => 'plumbing',
      loose: (a, b) => `${a}${b}`
    }
  });
  return { served, rows };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('a channel query, as an agent tool', () => {
  it('is offered after the commands, read-only and safe to repeat, unless it is hidden', () => {
    const tools = agentSurface([issuesApp().served]).tools();
    expect(tools.map(tool => tool.name)).toEqual([
      'issues_view',
      'issues_setQuery',
      'issues_find',
      'issues_get',
      'issues_count',
      'issues_slow',
      'issues_broken',
      'issues_loose'
    ]);
    const find = tools.find(tool => tool.name === 'issues_find')!;
    expect(find.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
    expect(find.description).toContain("without changing the person's list");
    expect(find.description).toContain('Returns the matching issues, at most limit of them.');
    expect(find.description).toContain("nothing on the person's screen moves");
    expect(find.inputSchema).toMatchObject({ required: ['text'] });
    expect(find.outputSchema).toBeUndefined();
  });

  it("answers with what the query returns, and the person's view neither moves nor is followed", async () => {
    const app = issuesApp();
    const surface = agentSurface([app.served]);

    const result = await surface.call('issues_find', { text: 'Login', limit: 1 });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({ result: [{ id: 'A-1', title: 'Login fails', priority: 1 }] });
    expect(resultText(result)).toBe('issues.find answered:\n[{"id":"A-1","title":"Login fails","priority":1}]');
    expect(app.rows.value).toHaveLength(1);
    expect(app.rows.observed).toBe(false);
  });

  it('hands back an object answer as it is, and nothing as null', async () => {
    const surface = agentSurface([issuesApp().served]);
    expect((await surface.call('issues_get', { id: 'A-3' })).structuredContent).toEqual({
      id: 'A-3',
      title: 'Typo on the pricing page',
      priority: 4
    });
    expect((await surface.call('issues_get', { id: 'nope' })).structuredContent).toEqual({ result: null });
    expect((await surface.call('issues_count', {})).structuredContent).toEqual({ result: 3 });
  });

  it('waits for an answer that is a promise', async () => {
    const result = await agentSurface([issuesApp().served]).call('issues_slow', {});
    expect(result.structuredContent).toEqual({ result: 7 });
  });

  it('refuses arguments the contract does not allow, before the query runs', async () => {
    const result = await agentSurface([issuesApp().served]).call('issues_find', { limit: 2 });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/text/);
  });

  it('reports a query that throws as a failed call the agent can read', async () => {
    const result = await agentSurface([issuesApp().served]).call('issues_broken', {});
    expect(result).toMatchObject({ isError: true });
    expect(resultText(result)).toBe('issues.broken failed: the index is not built');
  });

  it('gives up on a query that does not answer in thirty seconds', async () => {
    vi.useFakeTimers();
    const Stuck = defineChannel('stuck', { view: {}, queries: {} as { wait(): Promise<number> } });
    const surface = agentSurface([serve(Stuck, { view: {}, queries: { wait: () => new Promise<number>(() => {}) } })]);
    const pending = surface.call('stuck_wait', {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(resultText(await pending)).toBe('stuck.wait did not answer within 30 seconds.');
  });

  it('takes positional arguments when nothing described it', async () => {
    const surface = agentSurface([issuesApp().served]);
    const loose = surface.tools().find(tool => tool.name === 'issues_loose')!;
    expect(loose.description).toContain('positional list');
    expect((await surface.call('issues_loose', { arguments: ['a', 2] })).structuredContent).toEqual({ result: 'a2' });
  });

  it('will not share a name with a command', () => {
    const Clash = defineChannel('a', { view: {}, commands: {} as { go(): void }, queries: {} as { go(): number } });
    expect(() =>
      agentSurface([serve(Clash, { view: {}, commands: { go: () => {} }, queries: { go: () => 1 } })])
    ).toThrow("Two tools would be called 'a_go'");
  });

  it('is typed from the contract: an answer of the wrong type does not compile', () => {
    const Typed = defineChannel('typed', { view: {}, queries: {} as { size(): number } });
    expectTypeOf<QueriesOf<typeof Typed>>().toEqualTypeOf<{ size(): number }>();
    // @ts-expect-error: size answers a number, or a promise of one.
    serve(Typed, { view: {}, queries: { size: () => 'big' } });
    serve(Typed, { view: {}, queries: { size: async () => 3 } });
  });
});

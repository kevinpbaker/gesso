import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeChannel } from '../channel/ChannelSchema';
import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { AGENT_CONFIRM_MS, serveApplicationAgent, type AgentConfirmAsk } from './app';
import {
  agentSurface,
  fillQuestion,
  resultText,
  type AgentConfirmation,
  type AgentConfirmResult
} from './AgentSurface';
import { remoteSurface } from './remote';
import { confirmInWindow } from './webmcp';

interface Expense {
  id: string;
  cents: number;
  category: string;
  note: string;
}

const Expenses = defineChannel('expenses', {
  view: { rows: [] as readonly Expense[] },
  commands: {} as {
    remove(id: string): void;
    move(id: string, to: { category: string }): void;
    clear(): void;
  }
});

const input = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
});

describeChannel(Expenses, {
  view: { type: 'object', properties: { rows: { type: 'array' } } },
  commands: {
    remove: {
      description: 'Deletes an expense.',
      parameters: ['id'],
      input: input({ id: { type: 'string' } }, ['id']),
      destructive: true,
      confirm: true
    },
    move: {
      description: 'Moves an expense to another category.',
      parameters: ['id', 'to'],
      input: input({ id: { type: 'string' }, to: { type: 'object' } }, ['id', 'to']),
      confirm: true,
      question: 'Move expense {id} to {to.category}? {nothing} stays as written.'
    },
    clear: { description: 'Deletes every expense.', parameters: [], input: input({}, []), confirm: true }
  }
});

function expensesApp(wording = true) {
  const rows = new BehaviorSubject<readonly Expense[]>([
    { id: 'e1', cents: 335, category: 'Transport', note: 'Bus fare' },
    { id: 'e2', cents: 1250, category: 'Food', note: 'Lunch' }
  ]);
  const find = (id: string) => rows.value.find(row => row.id === id);
  const served = serve(Expenses, {
    view: { rows },
    commands: {
      remove: id => rows.next(rows.value.filter(row => row.id !== id)),
      move: (id, to) => rows.next(rows.value.map(row => (row.id === id ? { ...row, category: to.category } : row))),
      clear: () => rows.next([])
    },
    ...(wording
      ? {
          confirm: {
            remove: id => {
              const row = find(id)!;
              return {
                title: 'Delete this expense?',
                detail: `$${(row.cents / 100).toFixed(2)} ${row.category}, ${row.note}`,
                action: 'Delete'
              };
            },
            clear: () => {
              throw new Error('no wording today');
            }
          }
        }
      : {})
  });
  return { served, rows };
}

const fast = { quietMs: 1, settleMs: 30 };

function asking(answer: (request: AgentConfirmation) => AgentConfirmResult) {
  const asked: AgentConfirmation[] = [];
  return {
    asked,
    confirm: (request: AgentConfirmation) => {
      asked.push(request);
      return answer(request);
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the question a @confirm command puts to the person', () => {
  it("is the application's own, worded from the data on the thread that has it", async () => {
    const app = expensesApp();
    const { asked, confirm } = asking(() => 'approved');
    const result = await agentSurface([app.served], { ...fast, confirm }).call(
      'expenses_remove',
      { id: 'e1' },
      { agent: 'Claude Code' }
    );
    expect(result.isError).toBe(false);
    expect(asked[0].question).toEqual({
      title: 'Delete this expense?',
      detail: '$3.35 Transport, Bus fare',
      action: 'Delete'
    });
    expect(asked[0].agent).toBe('Claude Code');
  });

  it('is the one after the @confirm tag, with the arguments put in, when the application wrote none', async () => {
    const { asked, confirm } = asking(() => true);
    await agentSurface([expensesApp().served], { ...fast, confirm }).call('expenses_move', {
      id: 'e2',
      to: { category: 'Treats' }
    });
    expect(asked[0].question).toEqual({ title: 'Move expense e2 to Treats? {nothing} stays as written.' });
    expect(asked[0].agent).toBeUndefined();
  });

  it("falls back from wording that throws to one written from the command's name", async () => {
    const { asked, confirm } = asking(() => true);
    await agentSurface([expensesApp().served], { ...fast, confirm }).call('expenses_clear', {});
    expect(asked[0].question).toEqual({ title: 'Allow clear in expenses?', detail: 'Deletes every expense.' });
  });

  it('fills a template from nested arguments, and leaves what it cannot fill', () => {
    expect(fillQuestion('Rename {id} to { patch.title } ({patch.missing})', { id: 7, patch: { title: 'Tea' } })).toBe(
      'Rename 7 to Tea ({patch.missing})'
    );
  });
});

describe('the answer', () => {
  it('sends the command only when approved, and tells a no from nobody asked', async () => {
    const app = expensesApp();
    let answer: AgentConfirmResult = 'declined';
    const surface = agentSurface([app.served], { ...fast, confirm: () => answer });

    expect(resultText(await surface.call('expenses_remove', { id: 'e1' }))).toBe(
      'The person declined expenses.remove. Do not send it again unless they ask.'
    );
    answer = { unavailable: "the app's window is hidden" };
    expect(resultText(await surface.call('expenses_remove', { id: 'e1' }))).toBe(
      "Nobody could be asked to approve expenses.remove: the app's window is hidden. The person did not decline " +
        "it. Ask them to bring the app's window forward and call it again, or to do it themselves."
    );
    answer = Promise.resolve('unavailable');
    expect(resultText(await surface.call('expenses_remove', { id: 'e1' }))).toContain(
      'there was no way to show them the question'
    );
    expect(app.rows.value).toHaveLength(2);

    answer = Promise.resolve('approved');
    expect((await surface.call('expenses_remove', { id: 'e1' })).isError).toBe(false);
    expect(app.rows.value).toHaveLength(1);
  });

  it('takes a confirm that throws as nobody asked', async () => {
    const surface = agentSurface([expensesApp().served], {
      ...fast,
      confirm: () => {
        throw new Error('no dialog');
      }
    });
    expect(resultText(await surface.call('expenses_clear', {}))).toContain('asking failed: no dialog');
  });
});

describe("the browser's own dialog", () => {
  const request: AgentConfirmation = {
    channel: 'expenses',
    command: 'remove',
    arguments: { id: 'e1' },
    destructive: true,
    question: { title: 'Delete this expense?', detail: '$3.35 Transport, Bus fare', action: 'Delete' },
    agent: 'Claude Code'
  };

  it('asks in the words of the question, and says which agent asks', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { confirm });
    vi.stubGlobal('document', { visibilityState: 'visible' });
    expect(confirmInWindow(request)).toBe('approved');
    expect(confirm).toHaveBeenCalledWith(
      'Delete this expense?\n\n$3.35 Transport, Bus fare\n\nThis cannot be undone.\n\nAsked by Claude Code. OK to delete.'
    );
  });

  it('does not try in a hidden window, and does not take a suppressed dialog as a no', () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('window', { confirm });
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    expect(confirmInWindow(request)).toEqual({ unavailable: expect.stringContaining('hidden') });
    expect(confirm).not.toHaveBeenCalled();

    vi.stubGlobal('document', { visibilityState: 'visible' });
    expect(confirmInWindow(request)).toEqual({ unavailable: expect.stringContaining('did not show its dialog') });
  });

  it('takes a no that took a person time as a no', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 400));
    vi.stubGlobal('window', { confirm: () => false });
    vi.stubGlobal('document', { visibilityState: 'visible' });
    expect(confirmInWindow(request)).toBe('declined');
  });
});

describe("the application's own question, on its screen", () => {
  function application(ask: AgentConfirmAsk | undefined, hidden = false) {
    const app = expensesApp();
    const pair = new MessageChannel();
    const page = vi.fn((): AgentConfirmResult => 'approved');
    serveApplicationAgent(pair.port2, {
      channels: () => [app.served],
      workers: () => [],
      confirm: () => ask,
      ui: () => ({
        semanticsTree: () => new Map(),
        focusedNodeId: () => null,
        applySemanticsAction: () => {},
        key: () => {},
        flush: () => {},
        agentContext: () => ({ hidden, inject: () => ({}) as never, environment: null })
      })
    });
    const surface = remoteSurface(pair.port1, { confirm: page });
    return { app, surface, page, close: () => (pair.port1.close(), pair.port2.close()) };
  }

  it('is asked instead of the page, given what it needs to draw', async () => {
    const ask = vi.fn<AgentConfirmAsk>(() => Promise.resolve('declined'));
    const { surface, page, close } = application(ask);
    const result = await surface.call('expenses_remove', { id: 'e1' }, { agent: 'Claude Code' });
    expect(resultText(result)).toContain('The person declined');
    expect(page).not.toHaveBeenCalled();
    const [request, context] = ask.mock.calls[0];
    expect(request.agent).toBe('Claude Code');
    expect(request.question.title).toBe('Delete this expense?');
    expect(context.signal.aborted).toBe(false);
    close();
  });

  it('is not shown in a hidden window, and the agent hears why', async () => {
    const ask = vi.fn<AgentConfirmAsk>(() => 'approved');
    const { surface, close } = application(ask, true);
    expect(resultText(await surface.call('expenses_remove', { id: 'e1' }))).toContain("the app's window is hidden");
    expect(ask).not.toHaveBeenCalled();
    close();
  });

  it('is withdrawn when nobody answers in time, and the agent is told nobody answered', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let signal: AbortSignal | undefined;
    const { app, surface, close } = application((_request, context) => {
      signal = context.signal;
      return new Promise(() => {});
    });
    const pending = surface.call('expenses_remove', { id: 'e1' });
    // Port messages go on the real event loop; only the timers are fake.
    const immediate = (globalThis as unknown as { setImmediate(run: () => void): void }).setImmediate;
    while (signal === undefined) await new Promise<void>(resolve => immediate(resolve));
    vi.advanceTimersByTime(AGENT_CONFIRM_MS);
    expect(signal.aborted).toBe(true);
    expect(resultText(await pending)).toContain(
      `nobody answered the question on the app's screen in ${AGENT_CONFIRM_MS / 1000} seconds`
    );
    expect(app.rows.value).toHaveLength(2);
    close();
  });
});

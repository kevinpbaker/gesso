import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { describeChannel } from '../channel/ChannelSchema';
import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { agentSurface, resourceUri, type AgentConfirmation } from './AgentSurface';

interface Row {
  id: string;
  title: string;
}

const Notes = defineChannel('notes', {
  view: { rows: [] as readonly Row[], status: 'loading' as 'loading' | 'ready' },
  commands: {} as {
    create(title: string, pinned?: boolean): void;
    remove(id: string): void;
    tag(id: string, ...tags: string[]): void;
    attach(file: { name: string; bytes: Uint8Array }): void;
    debugReset(): void;
  }
});

/** What gesso-vite-plugin writes for the contract above. */
describeChannel(Notes, {
  description: 'The notes the person has written.',
  view: {
    type: 'object',
    properties: {
      rows: { type: 'array', items: { $ref: '#/$defs/Row' } },
      status: { enum: ['loading', 'ready'] }
    },
    required: ['rows', 'status'],
    $defs: {
      Row: {
        type: 'object',
        properties: { id: { type: 'string' }, title: { type: 'string' } },
        required: ['id', 'title']
      }
    }
  },
  commands: {
    create: {
      description: 'Writes a new note.',
      parameters: ['title', 'pinned'],
      input: {
        type: 'object',
        properties: { title: { type: 'string' }, pinned: { type: 'boolean' } },
        additionalProperties: false,
        required: ['title']
      }
    },
    remove: {
      description: 'Deletes a note for good.',
      parameters: ['id'],
      input: {
        type: 'object',
        properties: { id: { type: 'string' } },
        additionalProperties: false,
        required: ['id']
      },
      destructive: true,
      confirm: true
    },
    tag: {
      parameters: ['id', 'tags'],
      rest: true,
      idempotent: true,
      input: {
        type: 'object',
        properties: { id: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
        required: ['id']
      }
    },
    attach: {
      parameters: ['file'],
      input: {
        type: 'object',
        properties: {
          file: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              bytes: { type: 'string', contentEncoding: 'base64', 'x-gesso-binary': 'Uint8Array' }
            },
            required: ['name', 'bytes']
          }
        },
        additionalProperties: false,
        required: ['file']
      }
    },
    debugReset: { parameters: [], input: { type: 'object', properties: {} }, hidden: true }
  }
});

/** An application behind the channel: plain RxJS, as it would be in a worker. */
function notesApp() {
  const rows = new BehaviorSubject<readonly Row[]>([]);
  const status = new BehaviorSubject<'loading' | 'ready'>('ready');
  const calls: unknown[][] = [];
  let next = 1;
  const served = serve(Notes, {
    view: { rows, status },
    commands: {
      create: (title: string, pinned?: boolean) => {
        calls.push(['create', title, pinned]);
        rows.next([...rows.value, { id: String(next++), title }]);
      },
      remove: (id: string) => rows.next(rows.value.filter(row => row.id !== id)),
      tag: (id: string, ...tags: string[]) => calls.push(['tag', id, ...tags]),
      attach: (file: { name: string; bytes: Uint8Array }) => calls.push(['attach', file.name, file.bytes]),
      debugReset: () => rows.next([])
    }
  });
  return { served, rows, calls };
}

const fast = { quietMs: 1, settleMs: 50 };

describe('an agent surface', () => {
  it('offers a view tool, and a tool per command that is not hidden', () => {
    const surface = agentSurface([notesApp().served], fast);
    expect(surface.tools().map(tool => tool.name)).toEqual([
      'notes_view',
      'notes_create',
      'notes_remove',
      'notes_tag',
      'notes_attach'
    ]);
  });

  it('describes each tool from the contract, with the hints a client shows', () => {
    const surface = agentSurface([notesApp().served], fast);
    const [view, create, remove, tag] = surface.tools();

    expect(view.description).toContain('The notes the person has written.');
    expect(view.annotations.readOnlyHint).toBe(true);
    expect(view.outputSchema).toMatchObject({ required: ['rows', 'status'] });

    expect(create.description).toMatch(/^Writes a new note\./);
    expect(create.inputSchema).toMatchObject({ required: ['title'] });
    expect(remove.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(remove.description).toContain('approve');
    expect(tag.annotations.idempotentHint).toBe(true);
  });

  it('sends a command by named arguments, and answers with the view it caused', async () => {
    const app = notesApp();
    const surface = agentSurface([app.served], fast);

    const result = await surface.call('notes_create', { title: 'Groceries' });

    expect(result.isError).toBe(false);
    expect(app.calls).toEqual([['create', 'Groceries', undefined]]);
    expect(result.structuredContent).toEqual({ rows: [{ id: '1', title: 'Groceries' }], status: 'ready' });
    expect(result.content[0].text).toContain('Sent create to notes');
  });

  it('waits for the effect of a command that answers after a request, rather than the first quiet moment', async () => {
    // A command whose work outlasts the quiet window: a fetch, a
    // subprocess. Nothing changes until it answers, and the view the
    // agent is given must be the one after it, not the one before.
    const rows = new BehaviorSubject<readonly Row[]>([]);
    const status = new BehaviorSubject<'loading' | 'ready'>('ready');
    const served = serve(Notes, {
      view: { rows, status },
      commands: {
        create: (title: string) => {
          setTimeout(() => rows.next([{ id: '1', title }]), 40);
        },
        remove: () => {},
        tag: () => {},
        attach: () => {},
        debugReset: () => {}
      }
    });

    const result = await agentSurface([served], { quietMs: 5, settleMs: 1000 }).call('notes_create', {
      title: 'Later'
    });

    expect(result.structuredContent).toEqual({ rows: [{ id: '1', title: 'Later' }], status: 'ready' });
  });

  it('returns at settleMs from a command that changes nothing in the view', async () => {
    const app = notesApp();
    const surface = agentSurface([app.served], { quietMs: 5, settleMs: 60 });
    const started = Date.now();

    const result = await surface.call('notes_tag', { id: '1', tags: ['home'] });

    expect(result.isError).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });

  it('spreads a rest parameter into the call', async () => {
    const app = notesApp();
    await agentSurface([app.served], fast).call('notes_tag', { id: '1', tags: ['home', 'urgent'] });
    expect(app.calls).toEqual([['tag', '1', 'home', 'urgent']]);
  });

  it('hands a command the bytes an agent sent as base64', async () => {
    const app = notesApp();
    await agentSurface([app.served], fast).call('notes_attach', { file: { name: 'a.txt', bytes: btoa('hi') } });
    const [, name, bytes] = app.calls[0] as [string, string, Uint8Array];
    expect(name).toBe('a.txt');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe('hi');
  });

  it('refuses arguments the contract does not allow, in words an agent can act on', async () => {
    const app = notesApp();
    const surface = agentSurface([app.served], fast);

    const wrong = await surface.call('notes_create', { title: 3 });
    expect(wrong.isError).toBe(true);
    expect(wrong.content[0].text).toBe('input.title must be a string, not number 3.');

    const extra = await surface.call('notes_create', { title: 'x', colour: 'red' });
    expect(extra.content[0].text).toBe('input.colour is not expected; the fields are title, pinned.');

    expect((await surface.call('notes_create', {})).content[0].text).toBe('input.title is required.');
    expect(app.calls).toEqual([]);
  });

  it('asks the person before a command marked @confirm, and does not send it when they say no', async () => {
    const app = notesApp();
    app.rows.next([{ id: '7', title: 'Old' }]);
    const asked: AgentConfirmation[] = [];
    let answer = false;
    const surface = agentSurface([app.served], {
      ...fast,
      confirm: request => {
        asked.push(request);
        return answer;
      }
    });

    const declined = await surface.call('notes_remove', { id: '7' });
    expect(declined.isError).toBe(true);
    expect(app.rows.value).toHaveLength(1);
    expect(asked[0]).toEqual({
      channel: 'notes',
      command: 'remove',
      description: 'Deletes a note for good.',
      arguments: { id: '7' },
      destructive: true
    });

    answer = true;
    expect((await surface.call('notes_remove', { id: '7' })).isError).toBe(false);
    expect(app.rows.value).toEqual([]);
  });

  it('refuses a command marked @confirm when there is nobody to ask', async () => {
    const app = notesApp();
    app.rows.next([{ id: '7', title: 'Old' }]);
    const result = await agentSurface([app.served], fast).call('notes_remove', { id: '7' });
    expect(result.content[0].text).toContain('no way to ask');
    expect(app.rows.value).toHaveLength(1);
  });

  it('never offers a hidden command, even by name', async () => {
    const app = notesApp();
    app.rows.next([{ id: '1', title: 'Keep' }]);
    const result = await agentSurface([app.served], fast).call('notes_debugReset', {});
    expect(result.isError).toBe(true);
    expect(app.rows.value).toHaveLength(1);
  });

  it('reports a command that throws as a failed call, not a crash', async () => {
    const Broken = defineChannel('broken', { view: {}, commands: {} as { go(): void } });
    const surface = agentSurface(
      [
        serve(Broken, {
          view: {},
          commands: {
            go: () => {
              throw new Error('disk full');
            }
          }
        })
      ],
      fast
    );
    const result = await surface.call('broken_go', { arguments: [] });
    expect(result).toMatchObject({ isError: true, content: [{ text: 'broken.go failed: disk full' }] });
  });

  it('still offers a channel nobody described, taking positional arguments', async () => {
    const Bare = defineChannel('counter', { view: { count: 0 }, commands: {} as { add(by: number): void } });
    const count = new BehaviorSubject(0);
    const surface = agentSurface(
      [serve(Bare, { view: { count }, commands: { add: (by: number) => count.next(count.value + by) } })],
      fast
    );

    const [view, add] = surface.tools();
    expect(view.outputSchema).toBeUndefined();
    expect(add.description).toContain('not described');

    const result = await surface.call('counter_add', { arguments: [5] });
    expect(result.structuredContent).toEqual({ count: 5 });
  });

  it('reads a view as a resource', () => {
    const app = notesApp();
    app.rows.next([{ id: '1', title: 'A' }]);
    const surface = agentSurface([app.served], fast);

    expect(surface.resources()).toEqual([
      {
        uri: 'gesso://notes/view',
        name: 'notes',
        description: 'The notes the person has written.',
        mimeType: 'application/json'
      }
    ]);
    expect(surface.read(resourceUri('notes'))).toEqual({ rows: [{ id: '1', title: 'A' }], status: 'ready' });
    expect(surface.read('gesso://other/view')).toBeUndefined();
  });

  it('subscribes to nothing until it is first used, and to nothing after dispose', async () => {
    const app = notesApp();
    const surface = agentSurface([app.served], fast);
    expect(app.rows.observed).toBe(false);
    await surface.call('notes_view', {});
    expect(app.rows.observed).toBe(true);
    surface.dispose();
    expect(app.rows.observed).toBe(false);
  });

  it('names a tool that does not exist, and the ones that do', async () => {
    const result = await agentSurface([notesApp().served], fast).call('notes_fly', {});
    expect(result.content[0].text).toBe(
      'There is no tool called notes_fly. The tools are notes_view, notes_create, notes_remove, notes_tag, notes_attach.'
    );
  });

  it('will not build two tools with one name', () => {
    const Clash = defineChannel('a', { view: {}, commands: {} as { view(): void } });
    expect(() => agentSurface([serve(Clash, { view: {}, commands: { view: () => {} } })])).toThrow(
      "Two tools would be called 'a_view'"
    );
  });
});

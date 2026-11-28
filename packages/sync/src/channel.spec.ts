import { defineChannel, provide, type ChannelPort } from 'gesso-framework/worker';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { createRoom } from './room';
import { snapshot } from './snapshot';

interface CardRow {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

const Board = defineChannel('sync-board', {
  view: { cards: [] as readonly CardRow[] },
  commands: {} as { add(id: string, title: string): void; toggle(id: string): void }
});

function recordingPort(): { port: ChannelPort; sent: unknown[]; deliver: (data: unknown) => void } {
  const sent: unknown[] = [];
  const port: ChannelPort = { postMessage: message => sent.push(message), onmessage: null };
  return { port, sent, deliver: data => port.onmessage?.({ data }) };
}

describe('a room behind a channel', () => {
  it('crosses the barrier as plain data, and a toggle crosses as one small patch', async () => {
    const doc = new Y.Doc();
    const room = createRoom(doc, { network: null });
    const cards = doc.getArray<Y.Map<unknown>>('cards');
    const find = (id: string): Y.Map<unknown> | undefined => cards.toArray().find(card => card.get('id') === id);
    const { port, sent, deliver } = recordingPort();

    provide(
      Board,
      {
        view: { cards: snapshot(cards, type => type.toJSON() as CardRow[]) },
        commands: {
          add: (id, title) =>
            room.transact('Add card', () => {
              const card = new Y.Map<unknown>();
              card.set('id', id);
              card.set('title', title);
              card.set('done', false);
              cards.push([card]);
            }),
          toggle: id =>
            room.transact('Toggle card', () => {
              const card = find(id);
              card?.set('done', card.get('done') !== true);
            })
        }
      },
      port
    );
    deliver({ type: 'channel:sync' });
    await Promise.resolve();

    deliver({ type: 'channel:command', command: 'add', payload: 'a', rest: ['Write the docs'] });
    deliver({ type: 'channel:command', command: 'add', payload: 'b', rest: ['Ship it'] });
    sent.length = 0;

    deliver({ type: 'channel:command', command: 'toggle', payload: 'b' });

    expect(sent).toEqual([
      { type: 'channel:patch', patches: [{ op: 'set', projection: 'cards', path: [1, 'done'], value: true }] }
    ]);
    room.destroy();
  });
});

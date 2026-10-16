import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { channel } from './ChannelToken';
import type { ChannelPort } from './ChannelProtocol';
import { ChannelReplica } from './ChannelReplica';
import { provide } from './provide';

interface PanelView {
  title: string;
  count: number;
  open: boolean;
}

interface PanelCommands {
  update(title: string): void;
  fail(): void;
}

const Panel = channel<PanelView, PanelCommands>('panel', { title: '', count: 0, open: false });

/** A port that records what is posted on it and lets a spec deliver to it, all synchronously. */
function recordingPort(): { port: ChannelPort; sent: unknown[]; deliver: (data: unknown) => void } {
  const sent: unknown[] = [];
  const port: ChannelPort = { postMessage: message => sent.push(message), onmessage: null };
  return { port, sent, deliver: data => port.onmessage?.({ data }) };
}

/** The application side of `Panel`, provided over a recording port and synced. */
async function providePanel() {
  const title = new BehaviorSubject('');
  const count = new BehaviorSubject(0);
  const open = new BehaviorSubject(false);
  const { port, sent, deliver } = recordingPort();
  const commands: PanelCommands = {
    update(next: string) {
      title.next(next);
      count.next(count.value + 1);
      open.next(true);
    },
    fail() {
      throw new Error('no');
    }
  };
  const provided = provide(Panel, { view: { title, count, open }, commands }, port);
  deliver({ type: 'channel:sync' });
  await Promise.resolve();
  sent.length = 0;
  return { title, count, open, sent, deliver, provided };
}

const typesOf = (sent: readonly unknown[]): string[] => sent.map(message => (message as { type: string }).type);

describe('a provided channel', () => {
  it('sends a command that moves several view keys as one message, at the end of the turn', async () => {
    const { sent, deliver } = await providePanel();

    deliver({ type: 'channel:command', command: 'update', payload: 'Inbox' });
    expect(sent).toEqual([]); // nothing until the synchronous work is done

    await Promise.resolve();
    expect(sent).toEqual([
      {
        type: 'channel:patch',
        patches: [
          { op: 'set', projection: 'title', path: [], value: 'Inbox' },
          { op: 'set', projection: 'count', path: [], value: 1 },
          { op: 'set', projection: 'open', path: [], value: true }
        ]
      }
    ]);
  });

  it('sends the patches published before any other message ahead of it', async () => {
    const { title, sent, deliver } = await providePanel();

    title.next('Drafts');
    deliver({ type: 'channel:command', command: 'fail', payload: undefined });
    title.next('Sent');
    deliver({ type: 'channel:sync' }); // a client that reattached: everything again, in full
    title.next('Archive');
    await Promise.resolve();

    expect(typesOf(sent)).toEqual([
      'channel:patch',
      'channel:error',
      'channel:patch',
      'channel:patch',
      'channel:patch'
    ]);
    const patches = sent.filter((_, index) => index !== 1) as { patches: { projection: string; value: unknown }[] }[];
    expect(patches[0].patches).toEqual([{ op: 'set', projection: 'title', path: [], value: 'Drafts' }]);
    expect(patches[1].patches).toEqual([{ op: 'set', projection: 'title', path: [], value: 'Sent' }]);
    expect(patches[2].patches.map(patch => [patch.projection, patch.value])).toEqual([
      ['title', 'Sent'],
      ['count', 0],
      ['open', false]
    ]);
    expect(patches[3].patches).toEqual([{ op: 'set', projection: 'title', path: [], value: 'Archive' }]);
  });

  it('delivers what was published before it was disposed', async () => {
    const { title, sent, provided } = await providePanel();

    title.next('Last');
    provided.dispose();
    expect(typesOf(sent)).toEqual(['channel:patch']);
    await Promise.resolve();
    expect(sent).toHaveLength(1);
  });
});

describe("a channel's replica", () => {
  it('tells each key a message touches once, with every patch to it applied', () => {
    const { port, deliver } = recordingPort();
    const replica = new ChannelReplica(Panel, port);
    const heard: string[] = [];
    replica.view.title.subscribe(value => heard.push(`title ${value}`));
    replica.view.count.subscribe(value => heard.push(`count ${value}`));
    heard.length = 0;

    deliver({
      type: 'channel:patch',
      patches: [
        { op: 'set', projection: 'count', path: [], value: 1 },
        { op: 'set', projection: 'title', path: [], value: 'Inbox' },
        { op: 'set', projection: 'count', path: [], value: 2 }
      ]
    });

    expect(heard).toEqual(['count 2', 'title Inbox']);
    replica.dispose();
  });
});

import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { channel, ChannelReplica, provide, type ChannelPort } from '@gesso/framework';
import { createActionLog, type ActionLog } from './ActionLog';

interface TickerView {
  ticks: number;
  label: string;
}

interface TickerCommands {
  step(by: number): void;
  reset(): void;
}

const Ticker = channel<TickerView, TickerCommands>('ticker', { ticks: 0, label: 'idle' });

/**
 * A synchronous stand-in for a `MessageChannel`.
 *
 * Synchronous on purpose: every assertion below is about what a
 * message did, and a real port would put an await between the cause
 * and the effect in every one of them.
 */
function portPair(): readonly [ChannelPort, ChannelPort] {
  const left: ChannelPort = {
    postMessage: message => right.onmessage?.({ data: message }),
    onmessage: null
  };
  const right: ChannelPort = {
    postMessage: message => left.onmessage?.({ data: message }),
    onmessage: null
  };
  return [left, right];
}

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function setup(limit?: number): {
  log: ActionLog;
  replica: ChannelReplica<TickerView, TickerCommands>;
  ticks: BehaviorSubject<number>;
  label: BehaviorSubject<string>;
} {
  const log = createActionLog(limit === undefined ? {} : { limit });
  const [providerEnd, replicaEnd] = portPair();
  const ticks = new BehaviorSubject(0);
  const label = new BehaviorSubject('idle');
  provide(
    Ticker,
    {
      view: { ticks, label },
      commands: {
        step: (by: number) => ticks.next(ticks.value + by),
        reset: () => {
          ticks.next(0);
          label.next('idle');
        }
      }
    },
    providerEnd
  );
  const replica = new ChannelReplica(Ticker, log.tapPort(replicaEnd, Ticker));
  return { log, replica, ticks, label };
}

describe('the action log', () => {
  it('records commands and patches on one timeline, in order', () => {
    const { log, replica } = setup();

    replica.send.step(2);
    replica.send.step(3);

    expect(log.entries.map(entry => `${entry.kind} ${entry.kind === 'command' ? entry.command : ''}`.trim())).toEqual([
      'command step',
      'patch',
      'command step',
      'patch'
    ]);
    expect(replica.view.ticks.value).toBe(5);
  });

  it('names the command, its payload and the projections a patch touched', () => {
    const { log, replica, label } = setup();

    replica.send.step(4);
    label.next('running');

    const command = log.entries[0];
    expect(command.kind).toBe('command');
    expect(command.kind === 'command' && command.payload).toBe(4);
    expect(log.entries.filter(entry => entry.kind === 'patch').flatMap(entry => entry.keys)).toEqual([
      'ticks',
      'label'
    ]);
  });

  it('says nothing until something crosses', () => {
    const { log } = setup();
    expect(log.entries).toEqual([]);
    expect(log.pinnedTo).toBeNull();
    expect(log.channels).toEqual(['ticker']);
  });

  it('puts the view back to an earlier step', () => {
    const { log, replica } = setup();
    replica.send.step(1);
    replica.send.step(1);
    replica.send.step(1);
    expect(replica.view.ticks.value).toBe(3);

    const secondPatch = log.entries.filter(entry => entry.kind === 'patch')[1];
    log.jumpTo(secondPatch.seq);

    expect(replica.view.ticks.value).toBe(2);
    expect(log.pinnedTo).toBe(secondPatch.seq);
  });

  it('rewinds the view and not the application', () => {
    const { log, replica, ticks } = setup();
    replica.send.step(1);
    replica.send.step(1);

    const first = log.entries.filter(entry => entry.kind === 'patch')[0];
    log.jumpTo(first.seq);

    expect(replica.view.ticks.value).toBe(1);
    // The authoritative value never moved, and nothing on the owning
    // thread was told this happened.
    expect(ticks.value).toBe(2);
  });

  it('holds patches while pinned, and catches the view up on going live', () => {
    const { log, replica, ticks } = setup();
    replica.send.step(1);
    const first = log.entries.filter(entry => entry.kind === 'patch')[0];
    log.jumpTo(first.seq);

    ticks.next(9);
    // Recorded, so the step exists on the timeline.
    expect(log.entries.filter(entry => entry.kind === 'patch')).toHaveLength(2);
    // Held, so the view stayed where it was put.
    expect(replica.view.ticks.value).toBe(1);

    log.jumpTo(null);
    expect(replica.view.ticks.value).toBe(9);
    expect(log.pinnedTo).toBeNull();
  });

  it('still forwards a command sent while pinned', () => {
    const { log, replica, ticks } = setup();
    replica.send.step(1);
    log.jumpTo(log.entries[0].seq);

    replica.send.step(5);

    // The application ran it: the view is what was frozen, not the app.
    expect(ticks.value).toBe(6);
    expect(log.entries.filter(entry => entry.kind === 'command')).toHaveLength(2);
  });

  it('reconstructs a step exactly after older ones fell off the log', () => {
    const { log, replica } = setup(4);
    for (let i = 0; i < 10; i++) {
      replica.send.step(1);
    }
    expect(log.entries).toHaveLength(4);
    expect(replica.view.ticks.value).toBe(10);

    // The oldest surviving patch. Everything before it was folded into
    // the base state, so this is still an exact answer rather than a
    // partial one reconstructed from half a history.
    const oldest = log.entries.filter(entry => entry.kind === 'patch')[0];
    log.jumpTo(oldest.seq);
    expect(replica.view.ticks.value).toBe(9);
  });

  it('keeps a projection the patch did not touch', () => {
    const { log, replica, label } = setup();
    label.next('running');
    replica.send.step(3);

    const labelPatch = log.entries.filter(entry => entry.kind === 'patch')[0];
    log.jumpTo(labelPatch.seq);

    expect(replica.view.label.value).toBe('running');
    expect(replica.view.ticks.value).toBe(0);
  });

  it('empties the timeline and goes live', () => {
    const { log, replica } = setup();
    replica.send.step(1);
    log.jumpTo(log.entries[0].seq);

    log.clear();

    expect(log.entries).toEqual([]);
    expect(log.pinnedTo).toBeNull();
    expect(replica.view.ticks.value).toBe(1);
  });

  it('tells a subscriber when the timeline or the pinned step changed', () => {
    const { log, replica } = setup();
    let changes = 0;
    const stop = log.subscribe(() => changes++);

    replica.send.step(1);
    const after = changes;
    expect(after).toBeGreaterThan(0);

    log.jumpTo(log.entries[0].seq);
    expect(changes).toBe(after + 1);

    stop();
    replica.send.step(1);
    expect(changes).toBe(after + 1);
  });

  it('holds only plain data, so an entry can cross a thread', () => {
    const { log, replica, label } = setup();
    replica.send.step(1);
    label.next('running');

    // The contract that decides whether a recorder in the render worker
    // can hand its timeline to a panel in the shell: `postMessage` is a
    // structured clone, and it throws on exactly what must not be here.
    expect(structuredClone(log.entries)).toEqual(log.entries);
  });

  it('lets the channel through untouched once disposed', () => {
    const { log, replica, ticks } = setup();
    log.dispose();

    ticks.next(7);
    replica.send.step(1);

    expect(replica.view.ticks.value).toBe(8);
    expect(log.entries).toEqual([]);
  });

  it('tapping a worker handle hands the framework a real port', async () => {
    const log = createActionLog();
    const pair = new MessageChannel();
    const ticks = new BehaviorSubject(0);
    provide(
      Ticker,
      {
        view: { ticks, label: new BehaviorSubject('idle') },
        commands: { step: (by: number) => ticks.next(ticks.value + by), reset: () => ticks.next(0) }
      },
      pair.port2 as unknown as ChannelPort
    );
    const handle = log.tap({ open: () => pair.port1, spawned: true, terminate: () => {} }, [Ticker]);

    const port = handle.open('ticker');
    // What `WorkerHandle` promises. A channel registered through a tap
    // has to behave in every way like one that was not, and the
    // registry transfers this to a replica without asking.
    expect(port).toBeInstanceOf(MessagePort);
    const replica = new ChannelReplica(Ticker, port as unknown as ChannelPort);

    replica.send.step(3);
    await waitFor(() => replica.view.ticks.value === 3, 'the patch to come back through the relay');
    expect(log.entries.map(entry => entry.kind)).toEqual(['command', 'patch']);
  });

  it('gives everything one input caused the same cause, and mints nothing for an input that caused nothing', () => {
    const { log, replica } = setup();

    // An input that sends nothing: the label is opened and dropped,
    // and the next one is still the first cause anybody sees.
    log.cause('pointerMove (10, 10)')();
    const close = log.cause('pointerUp (40, 40)');
    replica.send.step(2);
    close();

    expect(log.entries.map(entry => entry.cause?.id)).toEqual([1, 1]);
    expect(log.entries[0]?.cause?.label).toBe('pointerUp (40, 40)');
  });

  it('stops handing a command out as the cause once a frame has drawn its answer', () => {
    const { log, replica, ticks } = setup();

    const close = log.cause('pointerUp (40, 40)');
    replica.send.step(2);
    close();
    log.frame(11);
    // Whatever the channel says next is its own doing: nobody pressed
    // anything, and the frame that drew the answer closed the click.
    ticks.next(9);

    const kinds = log.entries.map(entry => `${entry.kind}${entry.cause === undefined ? '' : ` #${entry.cause.id}`}`);
    expect(kinds).toEqual(['command #1', 'patch #1', 'frame #1', 'patch']);
  });

  it('records a frame only when there is something for it to close', () => {
    const { log, replica } = setup();

    log.frame(1);
    log.frame(2);
    expect(log.entries).toEqual([]);

    replica.send.step(1);
    log.frame(3);
    log.frame(4);

    expect(log.entries.filter(entry => entry.kind === 'frame').map(entry => entry.frame)).toEqual([3]);
  });

  it('records an error the owning thread reported', () => {
    const { log, replica } = setup();
    replica.onError(() => {});
    (replica.send as unknown as Record<string, () => void>).nonsense();

    const error = log.entries.at(-1);
    expect(error?.kind).toBe('error');
    expect(error?.kind === 'error' && error.message).toContain("has no command 'nonsense'");
  });
});

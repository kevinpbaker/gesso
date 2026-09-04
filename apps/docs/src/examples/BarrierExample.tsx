import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import {
  channel,
  isChannelClientMessage,
  isChannelHostMessage,
  provide,
  type ChannelPort,
  type ChannelSource,
  type ComponentContext,
  type Inputs,
  type Patch,
  type WorkerHandle
} from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

// #region contract
/**
 * The barrier, declared once. Both threads import this and nothing
 * else of each other's.
 *
 * `view` keys travel inward as patches, `commands` travel outward as
 * messages, and the initial value is what the screen draws until the
 * first patch arrives, so nothing ever observes `undefined` for a
 * declared key. A channel that is genuinely still loading says so in
 * its own shape, as `remaining` does here, rather than leaving the
 * view to infer it from an absence.
 */
export interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

export interface TasksView {
  tasks: readonly TaskRow[];
  remaining: string;
}

export interface TasksCommands {
  toggle(id: string): void;
  reset(): void;
}

export const Tasks = channel<TasksView, TasksCommands>('docs-tasks', {
  tasks: [],
  remaining: 'Waiting for the first patch'
});
// #endregion contract

const SEED: readonly TaskRow[] = [
  { id: 'measure', title: 'Measure the paragraph', done: true },
  { id: 'wrap', title: 'Wrap the lines', done: false },
  { id: 'paint', title: 'Paint the glyphs', done: false }
];

// #region store
/**
 * The application. Plain RxJS, no framework import, nothing here that
 * knows a view exists.
 *
 * In a real project this is an api client, a repository, a domain
 * model and a view model, in the application worker's module graph.
 * The framework cannot tell the difference between that and this, and
 * that is the whole of its opinion about an application's data layer:
 * it defines the barrier and leaves everything above it alone.
 */
export function createTaskStore(seed: readonly TaskRow[] = SEED) {
  const tasks = new BehaviorSubject<readonly TaskRow[]>(seed);
  return {
    tasks,
    remaining: tasks.pipe(
      map(rows => {
        const left = rows.filter(row => !row.done).length;
        return left === 0 ? 'All done' : `${left} of ${rows.length} left`;
      })
    ),
    toggle(id: string): void {
      tasks.next(tasks.value.map(row => (row.id === id ? { ...row, done: !row.done } : row)));
    },
    reset(): void {
      tasks.next(seed);
    }
  };
}

export type TaskStore = ReturnType<typeof createTaskStore>;

/**
 * One Observable per view key, one handler per command. This object is
 * the entire seam between the application above and the view below.
 */
export function taskSource(store: TaskStore): ChannelSource<TasksView, TasksCommands> {
  return {
    view: { tasks: store.tasks, remaining: store.remaining },
    commands: {
      toggle: (id: string) => store.toggle(id),
      reset: () => store.reset()
    }
  };
}
// #endregion store

/** How many lines of wire traffic the panel keeps. */
const LINES = 7;

export interface ChannelTap {
  /** Registered with `useChannel(Tasks, { worker })`. */
  readonly handle: WorkerHandle;
  /** Every message that has crossed, newest last. */
  readonly traffic: BehaviorSubject<readonly string[]>;
}

// #region tap
/**
 * Stands on the wire between the replica and the provider.
 *
 * A `ChannelPort` is `postMessage` plus `onmessage` and nothing else,
 * so anything port-shaped can sit in the middle of one: this relays
 * both directions and writes down what went past. It is the whole
 * reason the seam is the port rather than a callback, and it is what
 * `@gesso/devtools`' action log does properly, with a timeline and
 * time travel. Twenty lines is enough to make the traffic visible.
 *
 * The provider is created here, on the far side of the relay, so the
 * data in this example lives in the same worker as the view. Nothing
 * below the relay can tell: a channel served by an application worker
 * exchanges the same two messages over the same kind of port.
 */
export function tapChannel(source: ChannelSource<TasksView, TasksCommands>): ChannelTap {
  const traffic = new BehaviorSubject<readonly string[]>([]);
  const ports: MessagePort[] = [];
  const record = (line: string | null): void => {
    if (line !== null) {
      traffic.next([...traffic.value, line].slice(-LINES));
    }
  };

  const handle: WorkerHandle = {
    open(): MessagePort {
      const view = new MessageChannel();
      const data = new MessageChannel();
      view.port2.onmessage = event => {
        record(describe(event.data));
        data.port1.postMessage(event.data);
      };
      data.port1.onmessage = event => {
        record(describe(event.data));
        view.port2.postMessage(event.data);
      };
      provide(Tasks, source, data.port2 as unknown as ChannelPort);
      ports.push(view.port1, view.port2, data.port1, data.port2);
      return view.port1;
    },
    spawned: true,
    terminate(): void {
      for (const port of ports) {
        port.close();
      }
      ports.length = 0;
    }
  };

  return { handle, traffic };
}

/** One message, as a line: `↑` leaves the view, `↓` arrives at it. */
export function describe(data: unknown): string | null {
  if (isChannelClientMessage(data)) {
    return data.type === 'channel:sync' ? '↑ sync' : `↑ ${data.command}(${JSON.stringify(data.payload) ?? ''})`;
  }
  if (isChannelHostMessage(data)) {
    return data.type === 'channel:error' ? `! ${data.message}` : `↓ ${data.patches.map(patchLine).join(', ')}`;
  }
  return null;
}

/** `set tasks[1].done`: the op, the key, and the path inside it. */
function patchLine(patch: Patch): string {
  const path = patch.path.map(step => (typeof step === 'number' ? `[${step}]` : `.${step}`)).join('');
  return `${patch.op} ${patch.projection}${path}`;
}
// #endregion tap

// #region screen
/**
 * The view. It runs none of the application's logic: it reads the
 * latest value of each key and sends commands.
 *
 * Every view key is an `InputCell`, exactly like a prop, so a
 * component reads it, binds it, and cannot write it. Whether the value
 * came from a parent or from across a barrier makes no difference
 * here, which is why it is not worth a second name.
 */
export function BarrierScreen(inputs: Inputs<{ traffic: readonly string[] }>, ctx: ComponentContext) {
  const tasks = ctx.channel(Tasks);

  return (
    <row gap={16} padding={16} width={percent(100)} height={percent(100)} x="stretch">
      <column gap={8} width={230}>
        <text text={tasks.view.remaining} fontSize={13} fontWeight={600} color="text" />
        {tasks.view.tasks.pipe(
          map(rows =>
            rows.map(row => (
              <button
                key={row.id}
                label={row.title}
                onClick={() => tasks.send.toggle(row.id)}
                padding={8}
                x="stretch"
                borderRadius={6}
                borderWidth={1}
                borderColor="border"
                backgroundColor="background"
                cursor="pointer"
                modifiers={[HOVER_CONTROL]}>
                <row gap={8} y="center">
                  <text text={row.done ? '✓' : '·'} fontSize={12} color="textMuted" width={10} />
                  <text text={row.title} fontSize={12} color="text" />
                </row>
              </button>
            ))
          )
        )}
        <button
          label="Reset"
          onClick={() => tasks.send.reset()}
          padding={8}
          x="stretch"
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Reset" fontSize={12} color="text" />
        </button>
      </column>
      <column gap={4} flexGrow={1}>
        <text text="on the wire" fontSize={11} color="textMuted" />
        {inputs.traffic.pipe(
          map(lines =>
            lines.map((line, index) => (
              <text key={String(index)} text={line} fontSize={11} fontFamily="monospace" color="text" />
            ))
          )
        )}
      </column>
    </row>
  );
}
// #endregion screen

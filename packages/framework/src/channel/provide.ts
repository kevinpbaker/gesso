import { Subscription, type Observable } from 'rxjs';

import { diffProjection, type Patch } from './StorePatch';
import { isChannelClientMessage, type ChannelHostMessage, type ChannelPort } from './ChannelProtocol';
import { requirePlainData } from './plainData';
import { viewKeys, type ChannelToken, type CommandMap } from './ChannelToken';

/** What the owning thread supplies for a channel. */
export interface ChannelSource<View extends object, Commands extends object, Queries extends object = object> {
  /** One observable per declared view key. */
  view: { readonly [K in keyof View]: Observable<View[K]> };
  /** One handler per declared command. */
  commands?: Commands;
  /**
   * One answer per declared query: the data, or a promise of it. Asked
   * by AI agents only, through the channel's agent tools, never by the
   * render thread, so a query reads what it likes on this thread
   * without anything crossing until an agent asks.
   */
  queries?: QueryHandlers<Queries>;
}

/**
 * The functions that answer a channel's queries: each takes what the
 * query declares and returns what it declares, or a promise of it, so
 * an answer that has to wait on storage need not be declared async.
 */
export type QueryHandlers<Queries extends object> = {
  readonly [K in keyof Queries]: Queries[K] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never;
};

/**
 * Publishes a channel from the thread that owns its data.
 *
 * Each view key is subscribed, diffed against what the other side last
 * saw, and sent as patches. Whatever produced the observable — a bare
 * subject or a stack of layers — stays here; only plain data crosses.
 *
 * Keys are subscribed on the first sync request, so a channel nobody
 * is watching costs nothing.
 */
export function provide<View extends object, Commands extends object>(
  token: ChannelToken<View, Commands>,
  source: ChannelSource<View, Commands>,
  port: ChannelPort
): ProvidedChannel {
  return new ProvidedChannel(
    token as ChannelToken<object, CommandMap>,
    source as ChannelSource<object, CommandMap>,
    port
  );
}

export class ProvidedChannel {
  private readonly subscriptions = new Subscription();
  /**
   * What the other side is known to hold, seeded from the token's
   * initial value — which the replica also starts from, so an app
   * whose first emission equals the initial sends nothing at all.
   */
  private readonly previous = new Map<string, unknown>();
  private readonly checked = new Set<string>();
  /**
   * Patches a running command has published and not yet sent. A command
   * that moves five view keys used to post five messages, each cloned
   * across the barrier and applied by the replica on its own; they now
   * leave together, as one message, the moment the command returns.
   *
   * Work outside a command (a timer, a recalculation the application
   * thread schedules) has nothing that marks where it ends, so its
   * values are held in `dirty` and sent by a microtask, once the task
   * that published them has run to the end. Each used to be compared
   * and posted as it came: a store that wrote three keys in a row sent
   * three messages, and a stream that ticked twice in one task paid a
   * structural diff and a structured clone for a value nobody drew. A
   * caller that runs such work synchronously, a test above all, awaits
   * a microtask before it reads the port.
   */
  private pending: Patch[] = [];
  /**
   * The newest value of each key that changed since the last send, not
   * yet compared with what the client holds. Compared once, when sent.
   */
  private readonly dirty = new Map<string, unknown>();
  private flushQueued = false;
  private disposed = false;
  /** How many commands are running, nested ones counted. */
  private commanding = 0;

  private synced = false;

  constructor(
    private readonly token: ChannelToken<object, CommandMap>,
    private readonly source: ChannelSource<object, CommandMap>,
    private readonly port: ChannelPort
  ) {
    for (const key of viewKeys(token)) {
      this.previous.set(key, (token.initial as Record<string, unknown>)[key]);
    }
    this.port.onmessage = event => this.receive(event.data);
  }

  private receive(data: unknown): void {
    if (!isChannelClientMessage(data)) {
      return;
    }
    try {
      if (data.type === 'channel:sync') {
        this.sync();
        return;
      }
      this.commanding++;
      try {
        this.runCommand(data.command, data.payload, data.rest);
      } finally {
        // Before an error is reported below: the patches it published
        // happened first, and the wire says so.
        this.commanding--;
        if (this.commanding === 0) {
          this.sendPending();
        }
      }
    } catch (error) {
      // Reported rather than thrown: this runs on the thread that owns
      // the data, and a throw here would leave the view waiting for a
      // patch that never comes, with nothing said about why.
      this.post({
        type: 'channel:error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  private runCommand(name: string, payload: unknown, rest?: readonly unknown[]): void {
    const handler = this.source.commands?.[name];
    if (handler === undefined) {
      const names = Object.keys(this.source.commands ?? {})
        .sort()
        .join(', ');
      throw new Error(
        `Channel '${this.token.name}' has no command '${name}'. ` +
          `Declared commands: ${names.length > 0 ? names : '(none)'}.`
      );
    }
    // Spread rather than passed as one payload: a command carries as
    // many arguments as it declares. A client that sent none beyond
    // the first sends no `rest`, so this is the single-argument call
    // it always was.
    (handler as (...args: unknown[]) => void)(payload, ...(rest ?? []));
  }

  private sync(): void {
    if (this.synced) {
      this.resend();
      return;
    }
    this.synced = true;

    for (const key of viewKeys(this.token)) {
      const observable = (this.source.view as Record<string, Observable<unknown> | undefined>)[key];
      if (observable === undefined) {
        this.post({
          type: 'channel:error',
          message: `Channel '${this.token.name}' declares view key '${key}' but nothing was provided for it.`
        });
        continue;
      }
      this.subscriptions.add(
        observable.subscribe({
          next: value => this.publish(key, value),
          error: (error: unknown) =>
            this.post({
              type: 'channel:error',
              message: `Channel '${this.token.name}' view key '${key}' errored: ${
                error instanceof Error ? error.message : String(error)
              }`,
              stack: error instanceof Error ? error.stack : undefined
            })
        })
      );
    }
  }

  private publish(key: string, value: unknown): void {
    if (!this.checked.has(key)) {
      this.checked.add(key);
      try {
        // Once per key, on the first value: a design mistake, caught at
        // startup rather than felt as slowness later. See `plainData`.
        requirePlainData(this.token.name, key, value);
      } catch (error) {
        // Reported, not rethrown. This runs inside an observer's `next`,
        // and RxJS routes a throw there to its unhandled-error hook
        // rather than back to the subscriber — so a throw would surface
        // as a stray async error on this thread and say nothing at all
        // on the thread that needs to know.
        this.post({
          type: 'channel:error',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        return;
      }
    }
    this.dirty.set(key, value);
    if (this.commanding === 0 && !this.flushQueued) {
      this.flushQueued = true;
      queueMicrotask(() => {
        this.flushQueued = false;
        if (!this.disposed) {
          this.sendPending();
        }
      });
    }
  }

  /** Compares each changed key's newest value with the client's, once, into `pending`. */
  private collectDirty(): void {
    if (this.dirty.size === 0) {
      return;
    }
    for (const [key, value] of this.dirty) {
      const patches = diffProjection(key, this.previous.get(key), value);
      this.previous.set(key, value);
      for (const patch of patches) {
        this.pending.push(patch);
      }
    }
    this.dirty.clear();
  }

  /** Puts the patches published so far on the wire now. */
  private sendPending(): void {
    this.collectDirty();
    if (this.pending.length === 0) {
      return;
    }
    const patches = this.pending;
    this.pending = [];
    const message: ChannelHostMessage = { type: 'channel:patch', patches };
    this.port.postMessage(message);
  }

  /** Re-sends every key in full, for a client that reattached. */
  private resend(): void {
    // The full values supersede anything still waiting to be compared.
    this.collectDirty();
    this.pending = [];
    const patches: Patch[] = [];
    for (const [key, value] of this.previous) {
      patches.push({ op: 'set', projection: key, path: [], value });
    }
    if (patches.length > 0) {
      this.post({ type: 'channel:patch', patches });
    }
  }

  /**
   * Sends any other message, after the patches published before it: the
   * order on the wire is the order things happened in, batched or not.
   */
  private post(message: ChannelHostMessage): void {
    this.sendPending();
    this.port.postMessage(message);
  }

  dispose(): void {
    // What was published before the end is delivered, as it was when
    // every patch left at once.
    this.sendPending();
    this.disposed = true;
    this.subscriptions.unsubscribe();
    this.port.onmessage = null;
  }
}

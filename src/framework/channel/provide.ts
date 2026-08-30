import { Subscription, type Observable } from 'rxjs';

import { diffProjection, type Patch } from '../store/StorePatch';
import { isChannelClientMessage, type ChannelHostMessage, type ChannelPort } from './ChannelProtocol';
import { requirePlainData } from './plainData';
import { viewKeys, type ChannelToken, type CommandMap } from './ChannelToken';

/** What the owning thread supplies for a channel. */
export interface ChannelSource<View extends object, Commands extends object> {
  /** One observable per declared view key. */
  view: { readonly [K in keyof View]: Observable<View[K]> };
  /** One handler per declared command. */
  commands?: Commands;
}

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
      this.runCommand(data.command, data.payload);
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

  private runCommand(name: string, payload: unknown): void {
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
    (handler as (payload: unknown) => void)(payload);
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
    const patches = diffProjection(key, this.previous.get(key), value);
    this.previous.set(key, value);
    if (patches.length > 0) {
      this.post({ type: 'channel:patch', patches });
    }
  }

  /** Re-sends every key in full, for a client that reattached. */
  private resend(): void {
    const patches: Patch[] = [];
    for (const [key, value] of this.previous) {
      patches.push({ op: 'set', projection: key, path: [], value });
    }
    if (patches.length > 0) {
      this.post({ type: 'channel:patch', patches });
    }
  }

  private post(message: ChannelHostMessage): void {
    this.port.postMessage(message);
  }

  dispose(): void {
    this.subscriptions.unsubscribe();
    this.port.onmessage = null;
  }
}

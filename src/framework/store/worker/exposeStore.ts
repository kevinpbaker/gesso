import { Subscription, type Observable } from 'rxjs';

import { getStoreMetadata } from '../StoreMetadata';
import { diffProjection, type Patch } from '../StorePatch';
import type { Store } from '../Store';
import { isStoreClientMessage, type StoreHostMessage, type StorePort } from './StoreWorkerProtocol';

/**
 * Publishes a store from the thread that owns it.
 *
 * Call this in a data worker. The store's `@Projection()` getters
 * become the wire format: each is watched, diffed against its previous
 * value, and sent as patches. Whatever else the store computes —
 * however expensive — stays on this thread.
 *
 * Projections are only subscribed once a replica asks to sync, so a
 * store nobody is watching costs nothing.
 */
export function exposeStore(StoreClass: new () => Store, port: StorePort = self as unknown as StorePort): ExposedStore {
  return new ExposedStore(StoreClass, port);
}

export class ExposedStore {
  private readonly store: Store;
  private readonly subscriptions = new Subscription();
  private readonly previous = new Map<string, unknown>();

  private synced = false;

  constructor(
    StoreClass: new () => Store,
    private readonly port: StorePort
  ) {
    this.store = new StoreClass();
    this.store.init();
    this.port.onmessage = event => this.receive(event.data);
  }

  private receive(data: unknown): void {
    if (!isStoreClientMessage(data)) {
      return;
    }
    try {
      if (data.type === 'store:sync') {
        this.sync();
        return;
      }
      this.store.dispatch(data.action, data.payload);
    } catch (error) {
      // A throw here would be invisible to the thread that asked, and
      // the replica would simply stop updating with no explanation.
      this.post({
        type: 'store:error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Starts watching every projection.
   *
   * The first emission of each diffs against `undefined`, which
   * produces one whole-value set — exactly the snapshot a fresh
   * replica needs.
   */
  private sync(): void {
    if (this.synced) {
      this.resend();
      return;
    }
    this.synced = true;

    const projections = getStoreMetadata(this.store.constructor).projections;
    for (const name of projections) {
      const source = (this.store.projection as unknown as Record<string, Observable<unknown>>)[name];
      this.subscriptions.add(
        source.subscribe(value => {
          const patches = diffProjection(name, this.previous.get(name), value);
          this.previous.set(name, value);
          if (patches.length > 0) {
            this.post({ type: 'store:patch', patches });
          }
        })
      );
    }
  }

  /** Re-sends every projection in full, for a replica that reattached. */
  private resend(): void {
    const patches: Patch[] = [];
    for (const [name, value] of this.previous) {
      patches.push({ op: 'set', projection: name, path: [], value });
    }
    if (patches.length > 0) {
      this.post({ type: 'store:patch', patches });
    }
  }

  private post(message: StoreHostMessage): void {
    this.port.postMessage(message);
  }

  dispose(): void {
    this.subscriptions.unsubscribe();
    this.port.onmessage = null;
  }
}

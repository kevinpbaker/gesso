import { Subscription, type Observable } from 'rxjs';

import { getStoreMetadata } from '../StoreMetadata';
import { diffProjection, type Patch } from '../StorePatch';
import type { Store } from '../Store';
import { isStoreClientMessage, type StoreHostMessage, type StorePort } from './StoreWorkerProtocol';
import { servePorts, type PortHost } from '../../worker/WorkerPorts';

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

/**
 * Publishes several stores from one data worker.
 *
 * The worker's global channel carries only the port handshake (see
 * `WorkerPorts`), so each store gets a private `MessagePort` and a
 * worker can hold an application's whole state layer rather than one
 * store. Call it synchronously at the top level of the worker module:
 *
 *   serveStores({ CatalogStore, CartStore });
 *
 * The property names are the keys the client asks for, which is why
 * shorthand reads well here — `{ CatalogStore }` names it exactly as
 * the default key does.
 *
 * Returns a function that stops serving and disposes what it exposed.
 */
export function serveStores(stores: Record<string, new () => Store>, host?: PortHost): () => void {
  const exposed: ExposedStore[] = [];
  const stop = servePorts(
    (key, port) => {
      const StoreClass = stores[key];
      if (StoreClass === undefined) {
        // Declined, not answered: another `servePorts` on this worker
        // may serve the name, and if nobody does, `servePorts` itself
        // reports it on the port — naming everything the worker
        // serves, which is more than this call can see.
        return false;
      }
      exposed.push(exposeStore(StoreClass, port as unknown as StorePort));
      return true;
    },
    () => Object.keys(stores),
    host
  );
  return () => {
    stop();
    for (const store of exposed) {
      store.dispose();
    }
    exposed.length = 0;
  };
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

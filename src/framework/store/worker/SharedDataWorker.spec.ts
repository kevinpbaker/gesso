import { describe, expect, it } from 'vitest';

import { state } from '../../State';
import { Action, Projection, State } from '../decorators';
import { Store } from '../Store';
import { workerHandle, type PortHost } from '../../worker/WorkerPorts';
import { createStoreRegistry } from './createStoreRegistry';
import { serveStores } from './exposeStore';

class CatalogStore extends Store {
  @State() count = state(0);

  @Projection()
  get label(): string {
    return `catalog ${this.count.value}`;
  }

  @Action()
  add(): void {
    this.count.value++;
  }
}

class CartStore extends Store {
  @State() items = state<string[]>([]);

  @Projection()
  get contents(): string[] {
    return this.items.value;
  }

  @Action()
  put(name: unknown): void {
    this.items.value = [...this.items.value, String(name)];
  }
}

/**
 * One fake worker global, served by `serveStores`, standing in for a
 * data worker holding a whole application layer.
 */
function createDataWorker() {
  const host: PortHost = { onmessage: null };
  let spawns = 0;
  const stop = serveStores({ CatalogStore, CartStore }, host);
  const factory = (): Worker => {
    spawns++;
    return {
      postMessage: (message: unknown, transfer?: Transferable[]) => {
        host.onmessage?.({ data: message, ports: (transfer ?? []) as MessagePort[] });
      },
      terminate: () => {}
    } as unknown as Worker;
  };
  return { factory, stop, spawns: () => spawns };
}

/**
 * Waits for a condition rather than for a fixed delay: a patch crosses
 * two real MessagePort hops here, and a timeout long enough on an idle
 * machine is not long enough on a busy one.
 */
async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

describe('a data worker shared by several stores', () => {
  it('spawns one worker and keeps both replicas current', async () => {
    const worker = createDataWorker();
    const handle = workerHandle(worker.factory);
    const registry = createStoreRegistry([
      { storeClass: CatalogStore, worker: handle, key: 'CatalogStore' },
      { storeClass: CartStore, worker: handle, key: 'CartStore' }
    ]);

    const catalog = registry.registry.get(CatalogStore);
    const cart = registry.registry.get(CartStore);
    const labels: unknown[] = [];
    const contents: unknown[] = [];
    catalog.projection.label.subscribe(value => labels.push(value));
    cart.projection.contents.subscribe(value => contents.push(value));

    await waitFor(() => labels.at(-1) === 'catalog 0', 'the first catalog patch');
    await waitFor(() => Array.isArray(contents.at(-1)), 'the first cart patch');
    expect(worker.spawns()).toBe(1);

    catalog.dispatch('add');
    cart.dispatch('put', 'apple');

    // Each store's patches reached its own replica and no other.
    await waitFor(() => labels.at(-1) === 'catalog 1', 'the catalog update');
    await waitFor(() => String(contents.at(-1)) === 'apple', 'the cart update');

    registry.dispose();
    worker.stop();
  });

  it('gives a bare factory a worker of its own, as before', async () => {
    const first = createDataWorker();
    const second = createDataWorker();
    const registry = createStoreRegistry([
      { storeClass: CatalogStore, worker: first.factory },
      { storeClass: CartStore, worker: second.factory }
    ]);

    let catalogSeen = false;
    let cartSeen = false;
    registry.registry.get(CatalogStore).projection.label.subscribe(value => (catalogSeen = value !== undefined));
    registry.registry.get(CartStore).projection.contents.subscribe(value => (cartSeen = value !== undefined));
    await waitFor(() => catalogSeen && cartSeen, 'both replicas to sync');

    expect(first.spawns()).toBe(1);
    expect(second.spawns()).toBe(1);

    registry.dispose();
    first.stop();
    second.stop();
  });

  it('reports an unknown key back over the port instead of throwing into the void', async () => {
    // A throw inside a data worker is invisible to the page, and the
    // client would just never receive a patch. Sent back, it surfaces
    // through the replica's onError.
    const host: PortHost = { onmessage: null };
    serveStores({ CatalogStore, CartStore }, host);
    const channel = new MessageChannel();
    const reply = new Promise<unknown>(resolve => {
      channel.port1.onmessage = event => resolve(event.data);
    });

    expect(() =>
      host.onmessage?.({ data: { type: 'nodal:port', key: 'NoSuchStore' }, ports: [channel.port2] })
    ).not.toThrow();

    expect(await reply).toEqual({
      type: 'store:error',
      message: "No store is served under 'NoSuchStore'. Served stores: CartStore, CatalogStore."
    });
  });

  it('surfaces the unknown key through the registry error hook', async () => {
    const host: PortHost = { onmessage: null };
    serveStores({ CatalogStore }, host);
    const errors: string[] = [];
    const registry = createStoreRegistry(
      [
        {
          storeClass: CartStore,
          worker: () =>
            ({
              postMessage: (message: unknown, transfer?: Transferable[]) =>
                host.onmessage?.({ data: message, ports: (transfer ?? []) as MessagePort[] }),
              terminate: () => {}
            }) as unknown as Worker
        }
      ],
      (_store, message) => errors.push(message)
    );

    await waitFor(() => errors.length > 0, 'the error to reach the registry');
    expect(errors[0]).toMatch(/No store is served under 'CartStore'/);
    registry.dispose();
  });
});

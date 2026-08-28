import type { Store } from '../Store';
import { StoreRegistry } from '../StoreRegistry';
import { attachStore } from './attachStore';
import type { StorePort } from './StoreWorkerProtocol';

export interface StoreRegistration {
  storeClass: new () => Store;
  /**
   * Spawns the data worker that owns this store, when it is remote.
   *
   * A factory rather than a URL for the same reason the render worker
   * takes one: bundlers only split a worker they can see constructed
   * literally in the calling module.
   */
  worker?: () => Worker;
}

export interface RegistryHandle {
  registry: StoreRegistry;
  dispose(): void;
}

/**
 * Builds a registry from a mix of local and worker-owned stores.
 *
 * Shared by both configurations, because moving a store into a data
 * worker is meant to be independent of where rendering happens: a
 * single-thread app benefits from it just as much.
 */
export function createStoreRegistry(
  registrations: readonly StoreRegistration[],
  onError?: (storeName: string, message: string, stack?: string) => void
): RegistryHandle {
  const registry = new StoreRegistry();
  const workers: Worker[] = [];

  for (const registration of registrations) {
    if (registration.worker === undefined) {
      registry.register(registration.storeClass);
      continue;
    }
    const worker = registration.worker();
    workers.push(worker);
    const replica = attachStore(registration.storeClass, worker as unknown as StorePort);
    replica.onError((message, stack) => {
      if (onError !== undefined) {
        onError(registration.storeClass.name, message, stack);
      } else {
        console.error(`[nodal store ${registration.storeClass.name}] ${message}`, stack);
      }
    });
    registry.registerRemote(registration.storeClass, replica);
  }

  return {
    registry,
    dispose: () => {
      for (const worker of workers) {
        worker.terminate();
      }
      workers.length = 0;
    }
  };
}

import type { Store } from '../Store';
import { StoreRegistry } from '../StoreRegistry';
import { workerHandle, type WorkerHandle } from '../../worker/WorkerPorts';
import { attachStore } from './attachStore';
import type { StoreReplica } from './StoreReplica';
import type { StorePort } from './StoreWorkerProtocol';

export interface StoreRegistration {
  storeClass: new () => Store;
  /**
   * The data worker that owns this store, when it is remote.
   *
   * A `WorkerHandle` shared between registrations puts them in one
   * worker, which is how an application layer stays together instead
   * of being scattered a store per thread. A bare factory is still
   * accepted and gets a worker to itself.
   *
   * A factory rather than a URL either way, for the same reason the
   * render worker takes one: bundlers only split a worker they can see
   * constructed literally in the calling module.
   */
  worker?: WorkerHandle | (() => Worker);
  /**
   * The name this store is served under, matching the key it was given
   * to `serveStores` in the worker.
   *
   * Defaults to the class name, which is what `serveStores({ Store })`
   * shorthand produces. Pass it explicitly for a build that minifies
   * class names, or when one class is served twice.
   */
  key?: string;
}

function isWorkerHandle(worker: WorkerHandle | (() => Worker)): worker is WorkerHandle {
  return typeof worker === 'object';
}

export interface RegistryHandle {
  registry: StoreRegistry;
  /** Replicas of worker-owned stores, for frame-aligned patch flushing. */
  replicas: StoreReplica[];
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
  const handles = new Set<WorkerHandle>();
  // A bare factory is wrapped once per registration, so it keeps its
  // worker to itself; a handle passed to several registrations is the
  // same object each time and they share.
  const wrapped = new Map<() => Worker, WorkerHandle>();
  const replicas: StoreReplica[] = [];

  for (const registration of registrations) {
    if (registration.worker === undefined) {
      registry.register(registration.storeClass);
      continue;
    }
    let handle: WorkerHandle;
    if (isWorkerHandle(registration.worker)) {
      handle = registration.worker;
    } else {
      const factory = registration.worker;
      handle = wrapped.get(factory) ?? workerHandle(factory);
      wrapped.set(factory, handle);
    }
    handles.add(handle);
    const key = registration.key ?? registration.storeClass.name;
    const replica = attachStore(registration.storeClass, handle.open(key) as unknown as StorePort);
    replica.onError((message, stack) => {
      if (onError !== undefined) {
        onError(registration.storeClass.name, message, stack);
      } else {
        console.error(`[nodal store ${registration.storeClass.name}] ${message}`, stack);
      }
    });
    replicas.push(replica);
    registry.registerRemote(registration.storeClass, replica);
  }

  return {
    registry,
    replicas,
    dispose: () => {
      for (const handle of handles) {
        handle.terminate();
      }
      handles.clear();
      wrapped.clear();
    }
  };
}

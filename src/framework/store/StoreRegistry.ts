import type { Store } from './Store';
import type { StoreReplica } from './worker/StoreReplica';

/**
 * Holds store instances and resolves them by class.
 *
 * An entry is either a local store or a replica of one living in a
 * data worker. Components cannot tell the difference, because the only
 * members they are allowed to touch — `projection` and `dispatch` —
 * mean the same thing in both cases.
 */
export class StoreRegistry {
  private readonly stores = new Map<Function, Store | StoreReplica>();

  register(StoreClass: new () => Store): void {
    this.requireUnregistered(StoreClass);
    const store = new StoreClass();
    store.init();
    this.stores.set(StoreClass, store);
  }

  /**
   * Registers a replica of a store owned by another thread.
   */
  registerRemote(StoreClass: Function, replica: StoreReplica): void {
    this.requireUnregistered(StoreClass);
    this.stores.set(StoreClass, replica);
  }

  get<T extends Store>(StoreClass: new () => T): T {
    const store = this.stores.get(StoreClass);
    if (store === undefined) {
      throw new Error(`Store '${StoreClass.name}' is not registered. Did you forget useStore(...)?`);
    }
    return store as unknown as T;
  }

  private requireUnregistered(StoreClass: Function): void {
    if (this.stores.has(StoreClass)) {
      throw new Error(`Store '${StoreClass.name}' is already registered.`);
    }
  }

  has(StoreClass: Function): boolean {
    return this.stores.has(StoreClass);
  }
}

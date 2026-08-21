import type { Store } from './Store';

/**
 * Holds store instances and resolves them by class.
 */
export class StoreRegistry {
  private readonly stores = new Map<Function, Store>();

  register(StoreClass: new () => Store): void {
    if (this.stores.has(StoreClass)) {
      throw new Error(`Store '${StoreClass.name}' is already registered.`);
    }
    const store = new StoreClass();
    store.init();
    this.stores.set(StoreClass, store);
  }

  get<T extends Store>(StoreClass: new () => T): T {
    const store = this.stores.get(StoreClass);
    if (store === undefined) {
      throw new Error(`Store '${StoreClass.name}' is not registered. Did you forget createApp().useStore(...)?`);
    }
    return store as T;
  }

  has(StoreClass: Function): boolean {
    return this.stores.has(StoreClass);
  }
}

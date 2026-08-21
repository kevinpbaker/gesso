import { BehaviorSubject, distinctUntilChanged, map, type Observable } from 'rxjs';

import { State } from '../State';
import { getStoreMetadata } from './StoreMetadata';

/**
 * Base class for Nodal stores.
 *
 * Stores own reactive state (`@State()`), expose derived projections
 * (`@Projection()`), and accept dispatched actions (`@Action()`).
 */
export abstract class Store {
  private readonly stateChange$ = new BehaviorSubject<void>(undefined);
  private readonly actionMethods = new Map<string, (...args: unknown[]) => unknown>();

  constructor() {
    this.wireActions();
  }

  /**
   * Initializes state subscriptions. Must be called after the derived
   * class fields have been initialized (i.e. after `new StoreClass()`).
   */
  init(): void {
    this.validateStates();
  }

  /**
   * Selects a slice of store state or a projection as an observable.
   *
   * The selector is re-evaluated whenever any @State field changes.
   */
  select<R>(selector: (store: this) => R): Observable<R> {
    return this.stateChange$.pipe(
      map(() => selector(this)),
      distinctUntilChanged()
    );
  }

  /**
   * Dispatches an action by name.
   */
  dispatch(action: string, payload?: unknown): void {
    const handler = this.actionMethods.get(action);
    if (handler === undefined) {
      throw new Error(`Action '${action}' not found on store '${this.constructor.name}'.`);
    }
    handler(payload);
  }

  /**
   * Returns the names of actions defined on this store.
   */
  actionNames(): string[] {
    return [...this.actionMethods.keys()];
  }

  /**
   * Notifies subscribers that store state has changed.
   *
   * Called automatically by State cells created with state().
   */
  private notifyStateChange(): void {
    this.stateChange$.next(undefined);
  }

  private validateStates(): void {
    const metadata = getStoreMetadata(this.constructor);
    for (const stateName of metadata.states) {
      const value = (this as unknown as Record<string, unknown>)[stateName];
      if (!(value instanceof State)) {
        throw new Error(
          `Store '${this.constructor.name}' declares @State() '${stateName}' but it is not a State cell. ` +
            `Initialize it with state(initialValue).`
        );
      }
      // Subscribe to the state cell so any emission notifies selectors.
      value.subscribe(() => this.notifyStateChange());
    }
  }

  private wireActions(): void {
    const metadata = getStoreMetadata(this.constructor);
    for (const actionName of metadata.actions) {
      const method = (this as unknown as Record<string, (...args: unknown[]) => unknown>)[actionName];
      if (typeof method !== 'function') {
        throw new Error(`Store '${this.constructor.name}' declares @Action() '${actionName}' but it is not a method.`);
      }
      this.actionMethods.set(actionName, method.bind(this));
    }
  }
}

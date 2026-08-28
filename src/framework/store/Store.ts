import { BehaviorSubject, distinctUntilChanged, map, shareReplay, type Observable } from 'rxjs';

import { State } from '../State';
import { getStoreMetadata } from './StoreMetadata';
import { structurallyEqual } from './structuralEquals';

/**
 * Every member of a store exposed as an Observable.
 *
 * Legacy decorators cannot refine a class's type, so the runtime set
 * of @Projection() names is not visible to the type system. Accessing
 * a member that is not a declared projection therefore type-checks but
 * throws, with a message naming the valid projections.
 */
export type StoreProjections<T> = { [K in keyof T]: Observable<T[K]> };

/**
 * Base class for Nodal stores.
 *
 * Stores own reactive state (`@State()`), expose derived projections
 * (`@Projection()`), and accept dispatched actions (`@Action()`).
 */
export abstract class Store {
  private readonly stateChange$ = new BehaviorSubject<void>(undefined);
  private readonly actionMethods = new Map<string, (...args: unknown[]) => unknown>();
  private readonly projectionCache = new Map<string, Observable<unknown>>();
  private projectionProxy: StoreProjections<this> | undefined;

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
   * The store's @Projection() getters, each as an Observable.
   *
   *   store.projection.summary.subscribe(...)
   *
   * A projection emits its current value on subscribe and thereafter
   * only when the value actually changes, compared structurally.
   */
  get projection(): StoreProjections<this> {
    if (this.projectionProxy === undefined) {
      this.projectionProxy = this.createProjectionProxy();
    }
    return this.projectionProxy;
  }

  /**
   * Selects a slice of store state or a projection as an observable.
   *
   * The selector is re-evaluated whenever any @State field changes,
   * and emits only when the selected value actually changes.
   *
   * The comparison is structural, not by reference: a selector that
   * builds an object or array allocates a fresh value every run, so
   * reference equality would report a change on every unrelated state
   * emission and dirty the whole bound subtree.
   */
  select<R>(selector: (store: this) => R): Observable<R> {
    return this.stateChange$.pipe(
      map(() => selector(this)),
      distinctUntilChanged(structurallyEqual)
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

  private createProjectionProxy(): StoreProjections<this> {
    const metadata = getStoreMetadata(this.constructor);
    return new Proxy({} as StoreProjections<this>, {
      get: (_target, property): unknown => {
        if (typeof property !== 'string') {
          return undefined;
        }
        if (!metadata.projections.has(property)) {
          const names = [...metadata.projections].sort().join(', ');
          throw new Error(
            `'${property}' is not a @Projection() on store '${this.constructor.name}'. ` +
              `Declared projections: ${names.length > 0 ? names : '(none)'}.`
          );
        }
        let projection = this.projectionCache.get(property);
        if (projection === undefined) {
          projection = this.stateChange$.pipe(
            map(() => (this as unknown as Record<string, unknown>)[property]),
            distinctUntilChanged(structurallyEqual),
            // The getter may be costly; share one evaluation across
            // every component bound to the projection.
            shareReplay({ bufferSize: 1, refCount: true })
          );
          this.projectionCache.set(property, projection);
        }
        return projection;
      }
    });
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

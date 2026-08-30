import { BehaviorSubject, type Observable } from 'rxjs';

import { getStoreMetadata } from '../StoreMetadata';
import { applyPatches, type Patch } from '../StorePatch';
import type { Store, StoreProjections } from '../Store';
import { isStoreHostMessage, type StoreClientMessage, type StorePort } from './StoreWorkerProtocol';
import { isPortErrorMessage } from '../../worker/WorkerPorts';

/**
 * Stand-in for a store that lives in another thread.
 *
 * A replica runs none of the store's logic. It holds the latest value
 * of each `@Projection()`, kept current by patches, and forwards
 * dispatched actions to the authoritative store. That asymmetry is the
 * point: business logic and heavy computation stay in the data worker,
 * and the render thread holds only what the view reads.
 *
 * Components cannot tell a replica from a local store, because they
 * are only ever allowed to touch `projection` and `dispatch`.
 */
export class StoreReplica<T extends Store = Store> {
  private readonly values = new Map<string, BehaviorSubject<unknown>>();
  private readonly projectionNames: ReadonlySet<string>;
  private readonly projectionProxy: StoreProjections<T>;
  private errorListener: ((message: string, stack?: string) => void) | null = null;
  private pending: Patch[] | null = null;
  private scheduleFlush: (() => void) | null = null;

  constructor(
    private readonly storeClass: Function,
    private readonly port: StorePort
  ) {
    this.projectionNames = getStoreMetadata(storeClass).projections;
    for (const name of this.projectionNames) {
      this.values.set(name, new BehaviorSubject<unknown>(undefined));
    }
    this.projectionProxy = this.createProjectionProxy();

    this.port.onmessage = event => this.receive(event.data);
    // Ask for the current value of every projection. Sending this
    // rather than relying on the host to push first keeps the two ends
    // independent of which one finished starting up.
    this.post({ type: 'store:sync' });
  }

  /**
   * The store's projections, each as an Observable.
   *
   * Every projection emits `undefined` until the first patch arrives,
   * because a replica genuinely does not know the value yet. Views
   * should handle that the way they would any loading state.
   */
  get projection(): StoreProjections<T> {
    return this.projectionProxy;
  }

  /**
   * Sends an action to the authoritative store.
   *
   * Fire and forget: the effect comes back as patches, never as a
   * return value. There is no synchronous answer to be had across a
   * thread boundary, and pretending otherwise would invite callers to
   * write code that cannot work.
   */
  dispatch(action: string, payload?: unknown): void {
    this.post({ type: 'store:action', action, payload });
  }

  /**
   * Selectors are not available on a replica: there is no state here
   * to select from, only the projections the store chose to publish.
   */
  select(): never {
    throw new Error(
      `Store '${this.storeClass.name}' is remote, so select() has nothing to read. ` +
        `Add a @Projection() for the data this view needs.`
    );
  }

  /** Receives errors reported by the authoritative store. */
  onError(listener: ((message: string, stack?: string) => void) | null): void {
    this.errorListener = listener;
  }

  private receive(data: unknown): void {
    if (isPortErrorMessage(data)) {
      // The transport could not find anything serving this store's
      // name. Reported like any other store error, because from here
      // it is one: no patch will ever arrive.
      this.report(data.message);
      return;
    }
    if (!isStoreHostMessage(data)) {
      return;
    }
    if (data.type === 'store:error') {
      this.report(data.message, data.stack);
      return;
    }
    this.receivePatches(data.patches);
  }

  /**
   * Defers patch application to the next frame.
   *
   * A chatty data worker can deliver many patches between two frames.
   * Applied on arrival, each one pushes a value through the bindings
   * watching it, so the tree is rebuilt once per patch even though only
   * the last state is ever drawn. Queued instead, a burst costs one
   * pass. The runtime calls `flush()` from the frame's first phase.
   *
   * Immediate application stays the default, so a replica used outside
   * a runtime still behaves synchronously.
   */
  deferPatches(scheduleFlush: () => void): void {
    this.scheduleFlush = scheduleFlush;
    this.pending = [];
  }

  /** Whether queued patches are waiting for the next frame. */
  get hasPendingPatches(): boolean {
    return this.pending !== null && this.pending.length > 0;
  }

  /** Applies everything queued since the last flush. */
  flush(): void {
    if (this.pending === null || this.pending.length === 0) {
      return;
    }
    const batch = this.pending;
    this.pending = [];
    this.applyPatches(batch);
  }

  private report(message: string, stack?: string): void {
    const listener = this.errorListener ?? ((text, trace) => console.error(`[nodal store] ${text}`, trace));
    listener(message, stack);
  }

  private receivePatches(patches: readonly Patch[]): void {
    if (this.pending === null) {
      this.applyPatches(patches);
      return;
    }
    this.pending.push(...patches);
    this.scheduleFlush?.();
  }

  /**
   * Applies a batch of patches, emitting once per affected projection.
   *
   * Grouping matters: a batch that touches one projection three times
   * must not push three values through the bindings watching it.
   */
  applyPatches(patches: readonly Patch[]): void {
    const byProjection = new Map<string, Patch[]>();
    for (const patch of patches) {
      const existing = byProjection.get(patch.projection);
      if (existing === undefined) {
        byProjection.set(patch.projection, [patch]);
      } else {
        existing.push(patch);
      }
    }

    for (const [name, group] of byProjection) {
      const subject = this.values.get(name);
      if (subject === undefined) {
        // A projection this thread does not know about. Ignoring it
        // keeps a newer data worker from breaking an older replica.
        continue;
      }
      subject.next(applyPatches(subject.getValue(), group));
    }
  }

  private post(message: StoreClientMessage): void {
    this.port.postMessage(message);
  }

  private createProjectionProxy(): StoreProjections<T> {
    return new Proxy({} as StoreProjections<T>, {
      get: (_target, property): unknown => {
        if (typeof property !== 'string') {
          return undefined;
        }
        const subject = this.values.get(property);
        if (subject === undefined) {
          const names = [...this.projectionNames].sort().join(', ');
          throw new Error(
            `'${property}' is not a @Projection() on store '${this.storeClass.name}'. ` +
              `Declared projections: ${names.length > 0 ? names : '(none)'}.`
          );
        }
        return subject as Observable<unknown>;
      }
    });
  }
}

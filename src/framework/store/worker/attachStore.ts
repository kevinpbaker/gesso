import type { Store } from '../Store';
import { StoreReplica } from './StoreReplica';
import type { StorePort } from './StoreWorkerProtocol';

/**
 * Connects to a store published by another thread with exposeStore().
 *
 * Call this on the render thread. The returned replica is what
 * components inject: same projections, same dispatch, none of the
 * work.
 */
export function attachStore<T extends Store>(StoreClass: new () => T, port: StorePort): StoreReplica<T> {
  return new StoreReplica<T>(StoreClass, port);
}

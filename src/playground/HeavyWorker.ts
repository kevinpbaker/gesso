import { serveStores } from '../framework/store/worker/exposeStore';
import { HeavyStore } from './HeavyStore';

/**
 * Data worker owning HeavyStore.
 *
 * Receives actions, runs them here, and publishes the store's
 * projections as patches. Nothing else about the store crosses.
 *
 * `serveStores` rather than `exposeStore(HeavyStore)`: the worker's
 * global channel now carries only the port handshake, so a second
 * store added here would get a private port instead of needing a
 * second worker.
 */
serveStores({ HeavyStore });

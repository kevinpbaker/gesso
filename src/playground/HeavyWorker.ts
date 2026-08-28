import { exposeStore } from '../framework/store/worker/exposeStore';
import { HeavyStore } from './HeavyStore';

/**
 * Data worker owning HeavyStore.
 *
 * Receives actions, runs them here, and publishes the store's
 * projections as patches. Nothing else about the store crosses.
 */
exposeStore(HeavyStore);

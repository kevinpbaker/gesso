import { renderRoot } from '../../framework/app/worker/renderRoot';
import { LiveApp, LiveStore } from './LiveExampleApp';

/**
 * Render worker for the live example. The feed's timer runs here,
 * beside the tree it drives, so a busy main thread cannot stall it.
 */
renderRoot(LiveApp).useStore(LiveStore);

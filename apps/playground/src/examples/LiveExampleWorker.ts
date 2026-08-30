import { renderRoot } from '@gesso/framework';
import { LiveApp, LiveFeed } from './LiveExampleApp';

/**
 * Render worker for the live example. The feed's timer runs here,
 * beside the tree it drives, so a busy main thread cannot stall it.
 */
renderRoot(LiveApp).useService(LiveFeed);

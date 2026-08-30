import { renderRoot } from '@gesso/framework';
import { ROUTES, TransitionsExampleApp } from './TransitionsExampleApp';

/**
 * Render worker for the transitions example.
 *
 * Everything is on this side: the routes, the screens, the motion, and
 * — unusually — the video, which is fetched, demuxed and decoded here
 * through WebCodecs. `VideoDecoder` is available in a worker, so a
 * decoded frame is drawn on the thread that produced it and never
 * crosses the barrier. The shell exchanges a url and nothing else.
 */
renderRoot(TransitionsExampleApp).useRoutes(ROUTES);

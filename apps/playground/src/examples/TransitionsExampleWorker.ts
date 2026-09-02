import { renderRoot } from '@gesso/framework';
import { ROUTES, TransitionsExampleApp } from './TransitionsExampleApp';
import { Catalogue } from './transitions/TransitionsContract';

/**
 * Render worker for the transitions example.
 *
 * Everything is on this side: the routes, the screens, the motion, and
 * — unusually — the video, which is fetched, demuxed and decoded here
 * through WebCodecs. `VideoDecoder` is available in a worker, so a
 * decoded frame is drawn on the thread that produced it and never
 * crosses the barrier. What is *not* on this side is the data: the
 * playlists come over the `Catalogue` channel from
 * `transitions/TransitionsAppWorker.ts`, which the shell spawns and
 * wires to this worker with one `MessagePort`. The shell exchanges a
 * url and nothing else.
 */
renderRoot(TransitionsExampleApp).useRoutes(ROUTES).useChannel(Catalogue);

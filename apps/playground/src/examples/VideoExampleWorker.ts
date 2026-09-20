import { createComponent, renderRoot } from 'gesso-framework';
import { VideoExampleApp } from './VideoExampleApp';
import { ScenarioResolver } from './video/VideoScenarios';

/**
 * Render worker for the video example.
 *
 * The decoder is built here, in the worker entry, for the reason every
 * other resolver is: it is a function, no function crosses a
 * `postMessage`, and the thread that decodes is the one that builds
 * it. `VideoDecoder` exists on a worker, so a decoded frame is drawn
 * where it was produced and never crosses the barrier.
 *
 * The same instance goes to `useMedia`, which is where a `Video` finds
 * it, and into the tree as a prop, which is where the page reads what
 * each fetch cost. One resolver, two readers: the alternative was a
 * module-level singleton, and a runtime's media has to be per runtime.
 */
const resolver = new ScenarioResolver();

renderRoot(createComponent(VideoExampleApp, { resolver })).useMedia({ videoResolver: resolver });

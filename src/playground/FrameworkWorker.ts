import { renderRoot } from '../framework/app/worker/renderRoot';
import { DemoStore, FrameworkDemoRoot } from './FrameworkPlayground';

/**
 * Render worker for the framework playground.
 *
 * The entire UI lives here: components, the retained graph, layout,
 * input routing, and Canvas2D rasterization to an OffscreenCanvas.
 * The main thread runs the page shell and forwards events.
 */
renderRoot(FrameworkDemoRoot).useStore(DemoStore);

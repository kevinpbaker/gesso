import { renderRoot } from '../framework/app/worker/renderRoot';
import { DemoStore, FrameworkDemoRoot } from './FrameworkPlayground';
import { HeavyStore } from './HeavyStore';

/**
 * Render worker for the framework playground.
 *
 * The entire UI lives here: components, the retained graph, layout,
 * input routing, and Canvas2D rasterization to an OffscreenCanvas.
 * The main thread runs the page shell and forwards events.
 */
renderRoot(FrameworkDemoRoot)
  .useStore(DemoStore)
  .useStore(HeavyStore, {
    // Written out literally so the bundler emits a chunk for it.
    worker: () => new Worker(new URL('./HeavyWorker.ts', import.meta.url), { type: 'module' })
  });

import { renderRoot } from '../framework/app/worker/renderRoot';
import { DemoStore, FrameworkDemoRoot } from './FrameworkPlayground';
import { HeavyStore } from './HeavyStore';
import { Ticker } from './TickerChannel';
import { workerHandle } from '../framework/worker/WorkerPorts';

/**
 * One data worker for the whole application layer.
 *
 * Written out literally so the bundler emits a chunk for it, and
 * shared by every registration below so they land in one thread
 * instead of one thread each.
 */
const dataWorker = workerHandle(() => new Worker(new URL('./HeavyWorker.ts', import.meta.url), { type: 'module' }));

/**
 * Render worker for the framework playground.
 *
 * The entire UI lives here: components, the retained graph, layout,
 * input routing, and Canvas2D rasterization to an OffscreenCanvas.
 * The main thread runs the page shell and forwards events.
 */
renderRoot(FrameworkDemoRoot)
  .useStore(DemoStore)
  .useStore(HeavyStore, { worker: dataWorker })
  // The same worker, a second named port: the store on the old path
  // and the channel on the new one, side by side.
  .useChannel(Ticker, { worker: dataWorker });

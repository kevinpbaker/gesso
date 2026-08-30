import { renderRoot } from '../framework/app/worker/renderRoot';
import { DemoStore, FrameworkDemoRoot } from './FrameworkPlayground';
import { HeavyStore } from './HeavyStore';
import { Ticker } from './TickerChannel';
import { APPLICATION_WORKER } from '../framework/worker/WorkerPorts';

/**
 * Render worker for the framework playground.
 *
 * The entire UI lives here: components, the retained graph, layout,
 * input routing, and rasterization to an OffscreenCanvas.
 *
 * It spawns nothing. The shell creates the application worker and
 * hands this one a port to it, so `HeavyStore` and `Ticker` are named
 * over that port without this file knowing where it leads — which is
 * what keeps the application alive when this worker is replaced on a
 * renderer switch.
 */
renderRoot(FrameworkDemoRoot)
  .useStore(DemoStore)
  .useStore(HeavyStore, { worker: APPLICATION_WORKER })
  .useChannel(Ticker);

import { createApp } from '../../framework';
import { mountShell } from '../shell/AppShell';

/** Placeholder shown for a reading no frame has supplied yet. */
const PENDING = '—';

/**
 * Runs the live-data example in a render worker behind the shared page
 * chrome. The example itself is `examples/LiveExampleApp.tsx`.
 */
export function mountLiveExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-live', metrics: true });
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;
  let fpsText = PENDING;

  // The row is written once before the worker starts and then rewritten
  // on every frame, so the whole set of readings is on screen from the
  // moment the route mounts instead of appearing at the first report.
  // The labels never change, so these calls only rewrite values.
  const showMetrics = (dirty: string, measured: string, frame: string): void => {
    shell.setMetrics([
      { label: 'Thread', value: 'Render worker' },
      // Nodes the bindings dirtied, and of those the ones layout had
      // to measure again — the cost of a frame, node for node.
      { label: 'Dirty', value: dirty },
      { label: 'Measured', value: measured },
      { label: 'FPS', value: fpsText },
      { label: 'Frame', value: frame }
    ]);
  };
  showMetrics(PENDING, PENDING, PENDING);

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    worker: () => new Worker(new URL('../examples/LiveExampleWorker.ts', import.meta.url), { type: 'module' }),
    onFrame: metrics => {
      frames++;
      // A frame rate only means something over a window, so that one
      // reading holds its last value between reports. Every other
      // reading is this frame's and is written straight through.
      const now = performance.now();
      if (now - lastReport >= 500) {
        fpsText = (((frames - framesAtLastReport) * 1000) / (now - lastReport)).toFixed(0);
        lastReport = now;
        framesAtLastReport = frames;
      }
      showMetrics(String(metrics.nodes), String(metrics.measured), `${metrics.durationMs.toFixed(1)} ms`);
    },
    onError: (message, stack) => {
      shell.setStatus(`Render worker error: ${message}`);
      console.error('[gesso live example]', message, stack);
    }
  });
  shell.setStatus('Source: src/playground/examples/LiveExampleApp.tsx — try the rate buttons and the spike.');
  shell.setDetail(
    'Every frame dirties a few hundred properties and rebuilds nothing. Compare "Component bodies run" on the left.'
  );
  const dispose = app.mount(shell.preview);

  return () => {
    dispose();
    shell.dispose();
  };
}

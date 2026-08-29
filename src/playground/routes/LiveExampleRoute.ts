import { createApp } from '../../framework';
import { mountShell } from '../shell/AppShell';

/**
 * Runs the live-data example in a render worker behind the shared page
 * chrome. The example itself is `examples/LiveExampleApp.tsx`.
 */
export function mountLiveExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-live', metrics: true });
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    worker: () => new Worker(new URL('../examples/LiveExampleWorker.ts', import.meta.url), { type: 'module' }),
    onFrame: metrics => {
      frames++;
      const now = performance.now();
      if (now - lastReport < 500) {
        return;
      }
      const fps = ((frames - framesAtLastReport) * 1000) / (now - lastReport);
      lastReport = now;
      framesAtLastReport = frames;
      shell.setMetrics([
        { label: 'Thread', value: 'Render worker' },
        // Nodes the bindings dirtied, and of those the ones layout had
        // to measure again — the cost of a frame, node for node.
        { label: 'Dirty', value: String(metrics.nodes) },
        { label: 'Measured', value: String(metrics.measured) },
        { label: 'FPS', value: fps.toFixed(0) },
        { label: 'Frame', value: `${metrics.durationMs.toFixed(1)} ms` }
      ]);
    },
    onError: (message, stack) => {
      shell.setStatus(`Render worker error: ${message}`);
      console.error('[nodal live example]', message, stack);
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

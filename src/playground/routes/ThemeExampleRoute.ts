import { createApp } from '../../framework';
import { mountShell } from '../shell/AppShell';

/**
 * Runs the theming example in a render worker behind the shared page
 * chrome. The example itself is `examples/ThemeExampleApp.tsx`.
 */
export function mountThemeExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-theme', metrics: true });
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    worker: () => new Worker(new URL('../examples/ThemeExampleWorker.ts', import.meta.url), { type: 'module' }),
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
        { label: 'Frames', value: String(frames) },
        { label: 'FPS', value: fps.toFixed(0) },
        { label: 'Frame', value: `${metrics.durationMs.toFixed(1)} ms` }
      ]);
    },
    onError: (message, stack) => {
      shell.setStatus(`Render worker error: ${message}`);
      console.error('[nodal theme example]', message, stack);
    }
  });
  shell.setStatus('Source: src/playground/examples/ThemeExampleApp.tsx — change a setting on the left.');
  shell.setDetail('One theme in the environment; the page repaints without a node being rebuilt.');
  const dispose = app.mount(shell.preview);

  return () => {
    dispose();
    shell.dispose();
  };
}

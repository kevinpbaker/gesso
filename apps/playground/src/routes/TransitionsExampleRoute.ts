import { createApp } from '@gesso/framework';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';

/**
 * Runs the transitions example in a render worker behind the shared
 * page chrome; the example itself is `examples/TransitionsExampleApp.tsx`.
 *
 * `history: { mode: 'hash', base: 'example-transitions' }` is the same
 * arrangement the routing example uses: the playground's router owns
 * the first segment of the fragment and the app owns the rest, so
 * `#example-transitions/playlist/2` names this page and the screen
 * inside it at once, and the browser's Back button drives the
 * transition in reverse.
 */
export function mountTransitionsExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-transitions', metrics: true });
  const errors = mountRouteErrors(shell);
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () =>
      new Worker(new URL('../examples/TransitionsExampleWorker.ts', import.meta.url), { type: 'module' }),
    history: { mode: 'hash', base: 'example-transitions' },
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
    onError: errors.report
  });
  shell.setStatus('Source: apps/playground/src/examples/TransitionsExampleApp.tsx — click a card, then press Back.');
  shell.setDetail(
    'Shared elements morph between two live nodes rather than between two snapshots, and the video keeps playing across the navigation.'
  );
  const dispose = app.mount(shell.preview);

  return () => {
    dispose();
    errors.dispose();
    shell.dispose();
  };
}

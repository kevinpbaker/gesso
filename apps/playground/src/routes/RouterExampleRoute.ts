import { createApp } from 'gesso-framework';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';
import { addDevtoolsAction, connectRouteDevtools } from '../shell/devtools';
import { workerName } from '../shell/still';

/**
 * Runs the routing example in a render worker behind the shared page
 * chrome; the example itself is `examples/RouterExampleApp.tsx`.
 *
 * `history: { mode: 'hash', base: 'example-router' }` is the whole of
 * the arrangement between the two routers on this page. The
 * playground's own router owns the first segment of the fragment — it
 * is how every route here is addressed — and the app owns everything
 * after it, so `#example-router/mail/inbox/2` names this page and the
 * screen inside it at once. The playground's hash listener remounts
 * only when that first segment changes, so the app's own navigations
 * do not tear it down and rebuild it.
 */
export function mountRouterExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-router', metrics: true });
  const errors = mountRouteErrors(shell);
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () =>
      new Worker(new URL('../examples/RouterExampleWorker.ts', import.meta.url), {
        type: 'module',
        name: workerName()
      }),
    history: { mode: 'hash', base: 'example-router' },
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
  shell.setStatus(
    'Source: apps/playground/src/examples/RouterExampleApp.tsx — the browser’s Back button walks its routes.'
  );
  shell.setDetail(
    'Nested routes, params the compiler checks, and a guard, all in the render worker; the shell exchanges a url.'
  );
  const dispose = app.mount(shell.preview);
  const disconnectDevtools = connectRouteDevtools(app, 'example-router');
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    closeDevtools();
    disconnectDevtools();
    dispose();
    errors.dispose();
    shell.dispose();
  };
}

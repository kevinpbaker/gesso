import { createApp } from '@gesso/framework';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';

/**
 * Runs the sign-in example in a render worker behind the shared page
 * chrome. The status bar shows the frame rate; the example itself is
 * `examples/SignInExampleApp.tsx`.
 */
export function mountSignInExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-signin', metrics: true });
  const errors = mountRouteErrors(shell);
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () => new Worker(new URL('../examples/SignInExampleWorker.ts', import.meta.url), { type: 'module' }),
    appLogicWorker: () =>
      new Worker(new URL('../examples/signin/SignInAppWorker.ts', import.meta.url), { type: 'module' }),
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
  shell.setStatus('Source: apps/playground/src/examples/SignInExampleApp.tsx — the passcode is 246813.');
  shell.setDetail('Functional components in JSX over one channel; the authentication runs on the application worker.');
  const dispose = app.mount(shell.preview);

  return () => {
    dispose();
    errors.dispose();
    shell.dispose();
  };
}

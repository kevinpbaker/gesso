import { createApp } from 'gesso-framework';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';
import { addDevtoolsAction, connectRouteDevtools } from '../shell/devtools';
import { workerName } from '../shell/still';

/**
 * Runs the gestures example in a render worker behind the shared page
 * chrome. The example itself is `examples/InputExampleApp.tsx`.
 *
 * The worker configuration on purpose, as the modifiers route is: a
 * drop target hit-tests layout boxes, a pinch is assembled from two
 * contacts, and a shortcut registry reads the focused node. All three
 * could quietly depend on being on the thread the events arrive on, and
 * this is where that would show.
 */
export function mountInputExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-input', metrics: true });
  const errors = mountRouteErrors(shell);
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () =>
      new Worker(new URL('../examples/InputExampleWorker.ts', import.meta.url), {
        type: 'module',
        name: workerName()
      }),
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
  shell.setStatus('Source: apps/playground/src/examples/InputExampleApp.tsx. Press Ctrl+K for the shortcut palette.');
  shell.setDetail(
    'Drop targets, a pinch, a shortcut registry a palette can list, and a context menu the framework raises.'
  );
  const dispose = app.mount(shell.preview);
  const disconnectDevtools = connectRouteDevtools(app, 'example-input');
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    closeDevtools();
    disconnectDevtools();
    dispose();
    errors.dispose();
    shell.dispose();
  };
}

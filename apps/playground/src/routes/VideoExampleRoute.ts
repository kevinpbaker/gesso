import { createApp } from 'gesso-framework';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';
import { addDevtoolsAction, connectRouteDevtools } from '../shell/devtools';
import { workerName } from '../shell/still';

/**
 * Runs the video example in a render worker behind the shared page
 * chrome; the example itself is `examples/VideoExampleApp.tsx`.
 *
 * Nothing unusual here beyond the worker: every clip on the page is
 * fetched, demuxed and decoded on that thread, so the shell exchanges
 * a canvas and nothing else.
 */
export function mountVideoExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-video', metrics: true });
  const errors = mountRouteErrors(shell);
  let frames = 0;
  let lastReport = performance.now();
  let framesAtLastReport = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () =>
      new Worker(new URL('../examples/VideoExampleWorker.ts', import.meta.url), {
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
  shell.setStatus(
    'Source: apps/playground/src/examples/VideoExampleApp.tsx — scroll the page; every card makes one claim about the pipeline.'
  );
  shell.setDetail(
    'The same six seconds arriving as a url, a blob, a data URL and a range request; a fragmented file, a moov at the end, VP9 and AV1, a transport with captions, and a clip that is not decoding until you reach it.'
  );
  const dispose = app.mount(shell.preview);
  const disconnectDevtools = connectRouteDevtools(app, 'example-video');
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    closeDevtools();
    disconnectDevtools();
    dispose();
    errors.dispose();
    shell.dispose();
  };
}

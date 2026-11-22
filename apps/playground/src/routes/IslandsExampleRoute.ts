import { createApp, elementIsland, nativeInputIsland, provideIsland } from 'gesso-framework';
import { LagProbe, PROBE_ELEMENT } from '../examples/islands/IslandsContract';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';
import { addDevtoolsAction, connectRouteDevtools } from '../shell/devtools';
import { workerName } from '../shell/still';

/**
 * Runs the DOM islands example in a render worker behind the shared
 * page chrome. The two fields are native `<input>`s this shell makes;
 * the example itself is `examples/IslandsExampleApp.tsx`.
 */
export function mountIslandsExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-islands', metrics: true });
  const errors = mountRouteErrors(shell);
  let frames = 0;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () =>
      new Worker(new URL('../examples/IslandsExampleWorker.ts', import.meta.url), {
        type: 'module',
        name: workerName()
      }),
    islands: [
      nativeInputIsland,
      provideIsland(
        LagProbe,
        elementIsland(({ document }) => {
          const block = document.createElement('div');
          block.style.background = PROBE_ELEMENT;
          return block;
        })
      )
    ],
    onFrame: metrics => {
      frames++;
      shell.setMetrics([
        { label: 'Thread', value: 'Render worker' },
        { label: 'Frames', value: String(frames) },
        { label: 'Frame', value: `${metrics.durationMs.toFixed(1)} ms` }
      ]);
    },
    onError: errors.report
  });
  shell.setStatus('Source: apps/playground/src/examples/IslandsExampleApp.tsx; the two fields are native inputs.');
  shell.setDetail('DOM islands: real elements placed over boxes the render worker lays out.');
  const dispose = app.mount(shell.preview);
  const disconnectDevtools = connectRouteDevtools(app, 'example-islands');
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    closeDevtools();
    disconnectDevtools();
    dispose();
    errors.dispose();
    shell.dispose();
  };
}

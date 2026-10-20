import { createApp } from 'gesso-framework';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';
import { addDevtoolsAction, connectRouteDevtools } from '../shell/devtools';
import { workerName } from '../shell/still';

/**
 * The component workbench, in a render worker behind the shared page
 * chrome. The app is `workbench/WorkbenchApp.tsx` and each component's
 * states are a file in `workbench/fixtures/`.
 *
 * The app owns everything after the first segment of the fragment, as
 * the routing example does, so `#workbench/date-picker` is a link to
 * one component's page.
 */
export function mountWorkbenchRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'workbench' });
  const errors = mountRouteErrors(shell);

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () =>
      new Worker(new URL('../workbench/WorkbenchWorker.ts', import.meta.url), {
        type: 'module',
        name: workerName()
      }),
    history: { mode: 'hash', base: 'workbench' },
    onError: errors.report
  });
  shell.setStatus('Source: apps/playground/src/workbench/ — one file per component in fixtures/.');
  shell.setDetail(
    'Each card says what to try. Switch theme and direction above the cards; Reset rebuilds every state.'
  );
  const dispose = app.mount(shell.preview);
  const disconnectDevtools = connectRouteDevtools(app, 'workbench');
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    closeDevtools();
    disconnectDevtools();
    dispose();
    errors.dispose();
    shell.dispose();
  };
}

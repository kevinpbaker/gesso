import { createApp } from '@gesso/framework';
import { mountNodeInspector } from '@gesso/devtools';
import { mountShell } from '../shell/AppShell';
import { mountRouteErrors } from '../shell/errors';
import { addInspectAction } from '../shell/InspectorPanel';
import { addDevtoolsAction, connectRouteDevtools } from '../shell/devtools';
import { workerName } from '../shell/still';

/**
 * Layout an application can shape, in a render worker.
 *
 * `EXCELLENCE_ROADMAP.md` X7's browser check. The inspector toggle is
 * part of the page rather than a convenience on it: the exit criterion
 * for the custom layout protocol is an `explain` that reads sensibly,
 * and this is where you read it. Turn it on and hover the wall.
 *
 * The page itself is `examples/LayoutExampleApp.tsx` and the layout it
 * is arranged by is `examples/layout/masonry.ts`; this file is only
 * the chrome around them.
 */
export function mountLayoutExampleRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'example-layout' });
  const inspectorPanel = mountNodeInspector(shell.preview);
  const errors = mountRouteErrors(shell);
  let inspecting = false;

  const app = createApp({
    // Written out literally so the bundler can see and split it.
    renderWorker: () =>
      new Worker(new URL('../examples/LayoutExampleWorker.ts', import.meta.url), {
        type: 'module',
        name: workerName()
      }),
    onError: errors.report,
    // Built in the worker, where the tree is; it crosses as plain data.
    onInspect: inspection => inspectorPanel.set(inspection)
  });
  shell.setStatus('Source: apps/playground/src/examples/LayoutExampleApp.tsx.');
  shell.setDetail(
    'Drag the window narrower: the wall drops a column and the panels stack. Inspect layout and hover the wall to ' +
      'read what the masonry says about its own arrangement.'
  );
  const dispose = app.mount(shell.preview);
  const disconnectDevtools = connectRouteDevtools(app, 'example-layout');
  addInspectAction(shell, enabled => {
    inspecting = enabled;
    app.setInspector(enabled);
    if (!enabled) {
      inspectorPanel.set(null);
    }
  });
  const closeDevtools = addDevtoolsAction(shell);

  return () => {
    if (inspecting) {
      app.setInspector(false);
    }
    closeDevtools();
    disconnectDevtools();
    dispose();
    inspectorPanel.dispose();
    errors.dispose();
    shell.dispose();
  };
}

import { createApp } from '@gesso/framework';
import {
  connectDevtools,
  createActionLog,
  mountActionLogPanel,
  mountErrorOverlay,
  mountFrameProfiler,
  mountNodeInspector
} from '@gesso/devtools';

/**
 * Every tool in `@gesso/devtools`, wired to one application.
 *
 * The docs quote this file rather than retyping it, so the calls on
 * this page cannot drift from the ones that compile.
 *
 * It is written as one function for the sake of the snippet. A real
 * project would not turn all four on at once, and would not turn any of
 * them on in a production build: see the page.
 */
export function mountWithDevtools(host: HTMLElement): () => void {
  // #region overlay
  const errors = mountErrorOverlay(host);
  const detachWindow = errors.captureWindowErrors();
  // #endregion overlay

  // #region panels
  const inspector = mountNodeInspector(host);
  const profiler = mountFrameProfiler(host);
  const actions = createActionLog();
  const actionPanel = mountActionLogPanel(host, actions);
  // #endregion panels

  // #region app
  const app = createApp({
    renderWorker: () => new Worker(new URL('./CounterExampleWorker.ts', import.meta.url), { type: 'module' }),
    // The report is built in the render worker, where the tree is, and
    // crosses as plain data.
    onInspect: report => inspector.set(report),
    onFrame: metrics => profiler.report(metrics),
    onError: errors.report
  });
  const dispose = app.mount(host);
  // #endregion app

  // #region connect
  // Found by the Chrome extension, and by a panel mounted in this page.
  const disconnect = connectDevtools(app, { name: 'Counter', actions });
  // #endregion connect

  // #region toggles
  app.setInspector(true);
  profiler.setVisible(true);
  actionPanel.setVisible(true);
  // #endregion toggles

  return () => {
    disconnect();
    dispose();
    detachWindow();
    actionPanel.dispose();
    profiler.dispose();
    inspector.dispose();
    errors.dispose();
  };
}

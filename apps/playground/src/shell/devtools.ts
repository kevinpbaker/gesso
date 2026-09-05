import { connectDevtools, createDirectPorts, getDevtoolsHook, mountDevtoolsPanel } from '@gesso/devtools';
import type { ActionLog, DevtoolsApp } from '@gesso/devtools';
import type { AppShell } from './AppShell';
import { addToggleAction } from './InspectorPanel';
import { findRoute } from './routes';

/**
 * The devtools panel as a pane in the playground (`ADOPTION_ROADMAP.md`
 * A4's answer to "extension or overlay": both, behind one port).
 *
 * The Chrome extension is where a developer expects the panel; this is
 * the same panel for a page where no extension is installed, and for a
 * screenshot. It is mounted into the shell's pane through a pair of
 * ports joined in memory and attached to the same hook the extension's
 * content script would reach over `postMessage`, so what the two show
 * cannot differ.
 *
 * Opened by the "Devtools" action, or by `?devtools` on the page URL.
 */
export function addDevtoolsAction(shell: AppShell): () => void {
  let dispose: (() => void) | null = null;
  const open = (): void => {
    if (dispose !== null) {
      return;
    }
    const { page, panel } = createDirectPorts();
    const detach = getDevtoolsHook().attach(page);
    shell.devtools.hidden = false;
    const mounted = mountDevtoolsPanel(shell.devtools, panel);
    dispose = () => {
      mounted.dispose();
      detach();
      page.close();
      shell.devtools.hidden = true;
      dispose = null;
    };
  };
  const close = (): void => {
    dispose?.();
  };
  addToggleAction(shell, { off: 'Devtools', on: 'Hide devtools' }, enabled => (enabled ? open() : close()));
  if (wantsDevtools()) {
    open();
  }
  return close;
}

/**
 * Connects a route's application to the page's devtools hook under the
 * route's title, so the panel names it the way the header does.
 */
export function connectRouteDevtools(app: DevtoolsApp, routeId: string, actions?: ActionLog): () => void {
  return connectDevtools(app, {
    name: findRoute(routeId)?.title ?? routeId,
    ...(actions === undefined ? {} : { actions })
  });
}

function wantsDevtools(): boolean {
  try {
    return new URLSearchParams(location.search).has('devtools');
  } catch {
    return false;
  }
}

import { mountErrorOverlay } from '@gesso/devtools';
import { createApp } from '@gesso/framework';
import { createElement } from '../shell/dom';
import { connectRouteDevtools } from '../shell/devtools';

/**
 * The transitions example as an application in its own right.
 *
 * Every other route mounts `AppShell` first — a header, a nav, a
 * status bar, an FPS readout — and hands the app whatever rectangle is
 * left over. This one mounts none of it. The host is filled edge to
 * edge by the app's own canvas, so what is on screen is what someone
 * deploying this example would actually ship: no chrome, no metrics,
 * and no 16px of padding around the outside.
 *
 * It is the same render worker and the same component tree as
 * `#example-transitions`; only what surrounds them differs, which is
 * the whole point of having it. A framework that has only ever been
 * looked at inside its own playground has not been shown to work
 * outside one, and two things in particular are only visible here:
 * the app is sized by the window rather than by a pane, so the
 * columns and the card's clamped width are exercised at real widths;
 * and the first frame paints against nothing, so there is no dark
 * shell to hide a flash of unpainted ground behind.
 *
 * Hidden from the nav (`hidden: true` in `shell/routes`) rather than
 * listed beside the example it duplicates: two nav items rendering the
 * same app would pose a question the nav has no room to answer. It is
 * still a real route the router resolves, though, rather than a query
 * parameter or a build flag, so it is reached by typing
 *
 *   #transitions-app
 *
 * and it survives a reload, which is what makes it usable for the
 * measurement it exists for.
 */
export function mountTransitionsStandaloneRoute(host: HTMLElement): () => void {
  host.replaceChildren();
  const root = createElement('div', { className: 'pg-standalone' });
  host.appendChild(root);

  // The overlay rather than `shell/errors`, which reports into a
  // status bar this route does not have. Window errors are captured
  // for the same reason the shared helper captures them: the worker
  // spawning and the mount below run on this thread, and an exception
  // in either would otherwise reach devtools and nothing else.
  const overlay = mountErrorOverlay(root);
  const detachWindowErrors = overlay.captureWindowErrors();

  // A standalone app names itself in the tab. Restored on the way out,
  // so leaving for a playground route does not strand the example's
  // title on the window.
  const playgroundTitle = document.title;
  document.title = 'Playlists';

  const app = createApp({
    // Written out literally so the bundler can see and split it. The
    // specifier matches the one in `TransitionsExampleRoute`, so both
    // routes resolve to a single worker chunk rather than two copies.
    renderWorker: () =>
      new Worker(new URL('../examples/TransitionsExampleWorker.ts', import.meta.url), { type: 'module' }),
    appLogicWorker: () =>
      new Worker(new URL('../examples/transitions/TransitionsAppWorker.ts', import.meta.url), { type: 'module' }),
    // The app owns everything after the first segment, and it has to:
    // the playground's own router reads segment one on every
    // `hashchange` and remounts when it changes. An app given the
    // whole fragment would navigate to `#/playlist/2`, be read as a
    // route named `playlist`, resolve to nothing, and be replaced by
    // the layout inspector part-way through its own morph. `base` is
    // what keeps the two routers out of each other's way — the same
    // arrangement `TransitionsExampleRoute` and the routing example
    // use.
    history: { mode: 'hash', base: 'transitions-app' },
    onError: overlay.report
  });
  const dispose = app.mount(root);
  // No shell here, so no pane; the Chrome extension is how this route
  // is inspected, which is the configuration it exists to resemble.
  const disconnectDevtools = connectRouteDevtools(app, 'transitions-app');

  return () => {
    disconnectDevtools();
    dispose();
    document.title = playgroundTitle;
    detachWindowErrors();
    overlay.dispose();
    host.replaceChildren();
  };
}

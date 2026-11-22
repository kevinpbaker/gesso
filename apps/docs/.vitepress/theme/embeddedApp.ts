import type { RuntimeErrorSource, WorkerAppOptions } from 'gesso-framework';

/** What a page knows about the application it is embedding. */
export interface EmbeddedExample {
  readonly renderWorker: () => Worker;
  readonly colorScheme: 'light' | 'dark';
  readonly onError: (message: string, stack: string | undefined, source: RuntimeErrorSource) => void;
}

/** The parts of `window` that `reloadOnStaleWorker` touches. */
export interface StaleWorkerPage {
  readonly sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
  readonly location: Pick<Location, 'reload'>;
}

/** How long a reload done for a stale worker keeps another from firing. */
export const STALE_WORKER_RELOAD_WINDOW_MS = 10_000;

const STALE_WORKER_KEY = 'gesso-docs:stale-worker-reload';

/**
 * Reloads the page once when a worker's script does not load.
 *
 * The usual reason on this site is a deploy. Vercel serves only the
 * current deploy's files, and each file name has a content hash. A tab
 * that was open before the deploy keeps the old `LiveExample` chunk in
 * memory. When the reader goes to the next page with an example, that
 * chunk asks for the old worker file, gets a 404 with an HTML body, and
 * the example shows "the render worker failed to start: its script did
 * not load". A reload gets the new HTML, the new chunks, and the new
 * worker file name.
 *
 * Only the case where the script did not load: the browser sends a plain
 * `Event` with no message. A worker that loaded and then threw sends an
 * `ErrorEvent` with a message, and a reload cannot fix that, so the
 * example shows it as before.
 *
 * Only once in `STALE_WORKER_RELOAD_WINDOW_MS`. If the file is missing
 * from the current deploy too, a second reload finds the same 404, and
 * the example then shows the error instead of reloading forever. If
 * session storage throws (a private window can do this), there is no
 * guard, so there is no reload.
 *
 * Returns the worker, so a `renderWorker` factory can wrap its `new`.
 */
export function reloadOnStaleWorker(
  worker: Worker,
  page: StaleWorkerPage = window,
  now: () => number = Date.now
): Worker {
  worker.addEventListener('error', event => {
    const message = (event as Partial<ErrorEvent>).message;
    if (typeof message === 'string' && message !== '') {
      return;
    }
    try {
      const last = Number(page.sessionStorage.getItem(STALE_WORKER_KEY));
      if (Number.isFinite(last) && now() - last < STALE_WORKER_RELOAD_WINDOW_MS) {
        return;
      }
      page.sessionStorage.setItem(STALE_WORKER_KEY, String(now()));
    } catch {
      return;
    }
    page.location.reload();
  });
  return worker;
}

/**
 * The options every live example on this site is started with.
 *
 * The one that matters is the history. A Gesso app keeps its url in
 * the window it runs in, and `path` is the default, which is right for
 * an application deployed at its own origin and wrong for a guest: an
 * example embedded here would be told the documentation page's own
 * address at start-up and would push the site to a new one on every
 * navigation. `memory` is the same history a desktop window and a test
 * get, so a routed example walks a stack of its own and the reader's
 * address bar, Back button and browsing history stay VitePress's.
 *
 * It is set here rather than in an example so that it holds for every
 * example, whoever writes it. A function rather than an object literal
 * inside `LiveExample.vue` because that decision is worth a spec, and
 * a spec cannot reach into a Vue component without a DOM to mount it
 * in.
 */
export function embeddedAppOptions(example: EmbeddedExample): WorkerAppOptions {
  return {
    renderWorker: example.renderWorker,
    colorScheme: example.colorScheme,
    onError: example.onError,
    history: { mode: 'memory' }
  };
}

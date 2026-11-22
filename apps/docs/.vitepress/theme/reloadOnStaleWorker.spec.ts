import { describe, expect, it, vi } from 'vitest';

import { reloadOnStaleWorker, STALE_WORKER_RELOAD_WINDOW_MS, type StaleWorkerPage } from './embeddedApp';

/** A worker that only records its `error` listeners, so a spec can fire one. */
function fakeWorker() {
  const listeners: ((event: Event) => void)[] = [];
  const worker = {
    addEventListener: (type: string, listener: (event: Event) => void) => {
      if (type === 'error') {
        listeners.push(listener);
      }
    }
  } as unknown as Worker;
  return { worker, fire: (event: Event) => listeners.forEach(listener => listener(event)) };
}

function fakePage(store: Map<string, string> = new Map()) {
  const reload = vi.fn();
  const page: StaleWorkerPage = {
    sessionStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value)
    },
    location: { reload }
  };
  return { page, reload };
}

/** What the browser sends when the worker's script never loaded: no message. */
const notLoaded = () => new Event('error');

/** What the browser sends when the worker loaded and then threw. */
const threw = () => Object.assign(new Event('error'), { message: 'Uncaught SyntaxError: Unexpected token' });

/**
 * A tab open across a deploy asks for a worker file the new deploy no
 * longer has. One reload fixes that; more than one would loop on a file
 * that is truly missing.
 */
describe('reloadOnStaleWorker', () => {
  it('reloads the page when the worker script did not load', () => {
    const { worker, fire } = fakeWorker();
    const { page, reload } = fakePage();

    reloadOnStaleWorker(worker, page, () => 1_000_000);
    fire(notLoaded());

    expect(reload).toHaveBeenCalledOnce();
  });

  it('leaves a worker that loaded and then threw to the error the example shows', () => {
    const { worker, fire } = fakeWorker();
    const { page, reload } = fakePage();

    reloadOnStaleWorker(worker, page, () => 1_000_000);
    fire(threw());

    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload again inside the window, so a missing file shows its error', () => {
    const store = new Map<string, string>();
    let now = 1_000_000;

    const first = fakeWorker();
    const before = fakePage(store);
    reloadOnStaleWorker(first.worker, before.page, () => now);
    first.fire(notLoaded());

    now += STALE_WORKER_RELOAD_WINDOW_MS - 1;
    const second = fakeWorker();
    const after = fakePage(store);
    reloadOnStaleWorker(second.worker, after.page, () => now);
    second.fire(notLoaded());

    expect(before.reload).toHaveBeenCalledOnce();
    expect(after.reload).not.toHaveBeenCalled();
  });

  it('reloads again for a later deploy, once the window has passed', () => {
    const store = new Map<string, string>([['gesso-docs:stale-worker-reload', '1000000']]);
    const { worker, fire } = fakeWorker();
    const { page, reload } = fakePage(store);

    reloadOnStaleWorker(worker, page, () => 1_000_000 + STALE_WORKER_RELOAD_WINDOW_MS);
    fire(notLoaded());

    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload when session storage throws, since nothing could stop a loop', () => {
    const { worker, fire } = fakeWorker();
    const reload = vi.fn();
    const page: StaleWorkerPage = {
      sessionStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {}
      },
      location: { reload }
    };

    reloadOnStaleWorker(worker, page);
    fire(notLoaded());

    expect(reload).not.toHaveBeenCalled();
  });
});

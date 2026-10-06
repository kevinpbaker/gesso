import { afterEach, describe, expect, it } from 'vitest';

import type { ShellHistory } from '../shellHistory';
import { WorkerApp, type WorkerAppOptions } from './WorkerApp';
import type { RuntimeToShellMessage, ShellToRuntimeMessage } from './RenderWorkerProtocol';

/**
 * The shell's half of routing with a history it was handed.
 *
 * An app embedded in another product's page — a Forge Custom UI app is
 * an iframe inside Jira — does not own the address bar, and reaches it
 * only through a history object the host gives it. These drive the
 * two directions the shell carries a url between that object and the
 * render worker, without mounting: `attachHistory` is what `mount`
 * calls, and a `history` message is what the worker posts when the
 * router navigates.
 */
interface Internals {
  renderWorker: Pick<Worker, 'postMessage' | 'removeEventListener' | 'terminate'>;
  attachHistory(): void;
  handleWorkerMessage(event: MessageEvent<RuntimeToShellMessage>): void;
}

function hostHistory(initialUrl: string) {
  let current = initialUrl;
  let listener: ((url: string) => void) | null = null;
  const calls: string[] = [];
  const history: ShellHistory = {
    get url() {
      return current;
    },
    push: url => {
      calls.push(`push ${url}`);
      current = url;
    },
    replace: url => {
      calls.push(`replace ${url}`);
      current = url;
    },
    back: () => calls.push('back'),
    forward: () => calls.push('forward'),
    onChange: next => {
      listener = next;
    },
    dispose: () => calls.push('dispose')
  };
  return {
    history,
    calls,
    report: (url: string) => {
      current = url;
      listener?.(url);
    }
  };
}

/** A render worker that only records what the shell posts to it. */
function fakeWorker(post: (message: ShellToRuntimeMessage) => void): Internals['renderWorker'] {
  return {
    postMessage: (message: unknown) => post(message as ShellToRuntimeMessage),
    removeEventListener: () => {},
    terminate: () => {}
  };
}

function shell(history: WorkerAppOptions['history'], extra: Partial<WorkerAppOptions> = {}) {
  const app = new WorkerApp({ renderWorker: () => ({}) as unknown as Worker, history, ...extra });
  const internals = app as unknown as Internals;
  const posts: ShellToRuntimeMessage[] = [];
  internals.renderWorker = fakeWorker(message => posts.push(message));
  const fromWorker = (message: RuntimeToShellMessage): void =>
    internals.handleWorkerMessage({ data: message } as MessageEvent<RuntimeToShellMessage>);
  const urls = (): string[] => posts.flatMap(message => (message.type === 'url' ? [message.url] : []));
  return { app, internals, fromWorker, urls };
}

describe('WorkerApp with a history passed in', () => {
  it('tells the worker the url the host is at, at start-up', () => {
    const host = hostHistory('/issues/PROJ-1');
    const { internals, urls } = shell(host.history);

    internals.attachHistory();

    expect(urls()).toEqual(['/issues/PROJ-1']);
  });

  it('performs the navigation the worker asks for on the host', () => {
    const host = hostHistory('/');
    const { internals, fromWorker } = shell(host.history);
    internals.attachHistory();

    fromWorker({ type: 'history', action: 'push', url: '/issues/PROJ-2' });
    fromWorker({ type: 'history', action: 'replace', url: '/issues/PROJ-3' });
    fromWorker({ type: 'history', action: 'back' });
    fromWorker({ type: 'history', action: 'forward' });

    expect(host.calls).toEqual(['push /issues/PROJ-2', 'replace /issues/PROJ-3', 'back', 'forward']);
  });

  it('forwards the urls the host reports to the worker', () => {
    const host = hostHistory('/');
    const { internals, urls } = shell(host.history);
    internals.attachHistory();

    host.report('/issues/PROJ-4');

    expect(urls()).toEqual(['/', '/issues/PROJ-4']);
  });

  it('leaves it undisposed and stops listening when disposed, and a remount picks it up again', () => {
    const host = hostHistory('/');
    const { app, internals, urls } = shell(host.history);
    internals.attachHistory();

    app.dispose();
    host.report('/issues/PROJ-5');

    expect(host.calls).not.toContain('dispose');
    expect(urls()).toEqual(['/']);

    const after: string[] = [];
    // A remount spawns a new render worker and attaches again, around
    // the same history.
    internals.renderWorker = fakeWorker(message => {
      if (message.type === 'url') {
        after.push(message.url);
      }
    });
    internals.attachHistory();
    host.report('/issues/PROJ-6');

    expect(after).toEqual(['/issues/PROJ-5', '/issues/PROJ-6']);
  });

  it('still makes its own from options', () => {
    const { internals, urls } = shell({ mode: 'memory', initialUrl: '/issues' });

    internals.attachHistory();

    expect(urls()).toEqual(['/issues']);
  });
});

/**
 * `ShellService.openRoute` arriving at the shell: what a Cmd-click on an
 * in-app link becomes once it has crossed from the render worker.
 */
describe('WorkerApp opening a route somewhere new', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  /** A window whose `open` records its arguments. */
  function recordOpens(): unknown[][] {
    const calls: unknown[][] = [];
    (globalThis as { window?: unknown }).window = { open: (...args: unknown[]) => calls.push(args) };
    return calls;
  }

  it("hands the router's url to the host's onOpenRoute, and opens no tab", () => {
    const opens = recordOpens();
    const handled: string[] = [];
    const host = hostHistory('/');
    const { internals, fromWorker, urls } = shell(host.history, { onOpenRoute: url => handled.push(url) });
    internals.attachHistory();

    fromWorker({ type: 'openRoute', url: '/epic/BUD-12?story=BUD-13' });

    expect(handled).toEqual(['/epic/BUD-12?story=BUD-13']);
    expect(opens).toEqual([]);
    // The current screen stays where it is.
    expect(host.calls).toEqual([]);
    expect(urls()).toEqual(['/']);
  });

  it('opens a new tab at the address the history gives, keeping the opener out of it', () => {
    const opens = recordOpens();
    const host = hostHistory('/');
    const history = { ...host.history, href: (url: string) => `/app#${url}` };
    const { internals, fromWorker } = shell(history);
    internals.attachHistory();

    fromWorker({ type: 'openRoute', url: '/epic/BUD-12' });

    expect(opens).toEqual([['/app#/epic/BUD-12', '_blank', 'noopener']]);
    expect(host.calls).toEqual([]);
  });

  it('follows the url in place in memory mode, through the history and back to the worker', () => {
    const opens = recordOpens();
    const { internals, fromWorker, urls } = shell({ mode: 'memory', initialUrl: '/' });
    internals.attachHistory();

    fromWorker({ type: 'openRoute', url: '/epic/BUD-12' });

    expect(opens).toEqual([]);
    expect(urls()).toEqual(['/', '/epic/BUD-12']);
  });
});

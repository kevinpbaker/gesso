import { describe, expect, it, vi } from 'vitest';

import {
  createShellHistory,
  releaseShellHistory,
  resolveShellHistory,
  type HistoryWindow,
  type ShellHistory
} from './shellHistory';

/**
 * Just enough window for the two browser modes: a location the fake
 * `pushState` actually updates, and listeners that can be fired.
 *
 * Vitest runs in Node, and — as with `EditingProxy` — the contract
 * with the DOM here is small enough to state, which is what makes it
 * worth pinning.
 */
function fakeWindow(href = '/app'): HistoryWindow & {
  fire(type: string): void;
  readonly hrefs: string[];
  readonly replaced: string[];
  readonly back: ReturnType<typeof vi.fn>;
  readonly forward: ReturnType<typeof vi.fn>;
} {
  const listeners = new Map<string, Array<() => void>>();
  const location = { pathname: '/app', search: '', hash: '' };
  const hrefs: string[] = [];
  const replaced: string[] = [];
  const back = vi.fn();
  const forward = vi.fn();

  const apply = (url: string): void => {
    const [withoutHash = '', hash = ''] = url.split('#');
    const [pathname = '', search = ''] = withoutHash.split('?');
    location.pathname = pathname;
    location.search = search.length > 0 ? `?${search}` : '';
    location.hash = hash.length > 0 ? `#${hash}` : '';
  };
  apply(href);

  return {
    location,
    history: {
      pushState: (_data: unknown, _title: string, url: string) => {
        hrefs.push(url);
        apply(url);
      },
      replaceState: (_data: unknown, _title: string, url: string) => {
        replaced.push(url);
        apply(url);
      },
      back,
      forward
    },
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter(existing => existing !== listener)
      );
    },
    fire: (type: string) => {
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
    hrefs,
    replaced,
    back,
    forward
  };
}

describe('shellHistory', () => {
  describe('memory', () => {
    it('starts where it was told to and keeps a stack of its own', () => {
      const history = createShellHistory({ mode: 'memory', initialUrl: '/mail' });
      const seen: string[] = [];
      history.onChange(url => seen.push(url));

      expect(history.url).toBe('/mail');
      history.push('/mail/1');
      history.push('/settings');
      history.back();
      expect(history.url).toBe('/mail/1');
      history.forward();
      expect(history.url).toBe('/settings');
      expect(seen).toEqual(['/mail/1', '/settings']);
    });

    it('drops the forward entries when a push follows a back', () => {
      const history = createShellHistory({ mode: 'memory' });
      history.push('/a');
      history.push('/b');
      history.back();
      history.push('/c');
      history.forward();
      expect(history.url).toBe('/c');
    });

    it('is what a thread with no window gets, whatever mode was asked for', () => {
      const history = createShellHistory({ mode: 'path' }, undefined);
      history.push('/mail');
      expect(history.url).toBe('/mail');
    });
  });

  describe('path mode', () => {
    it('reads and writes the document path', () => {
      const host = fakeWindow('/app?tab=1');
      const history = createShellHistory({}, host);
      expect(history.url).toBe('/app?tab=1');

      history.push('/mail/2');
      expect(host.hrefs).toEqual(['/mail/2']);
      history.replace('/mail/3');
      expect(host.replaced).toEqual(['/mail/3']);
      expect(history.url).toBe('/mail/3');
    });

    it('reports a popstate as a url the person produced', () => {
      const host = fakeWindow();
      const history = createShellHistory({}, host);
      const seen: string[] = [];
      history.onChange(url => seen.push(url));

      host.location.pathname = '/mail/9';
      host.fire('popstate');
      expect(seen).toEqual(['/mail/9']);
    });

    it('hands back and forward straight to the window', () => {
      const host = fakeWindow();
      const history = createShellHistory({}, host);
      history.back();
      history.forward();
      expect(host.back).toHaveBeenCalled();
      expect(host.forward).toHaveBeenCalled();
    });
  });

  describe('hash mode', () => {
    it('keeps the app url in the fragment, after the base', () => {
      const host = fakeWindow('/playground');
      const history = createShellHistory({ mode: 'hash', base: 'example-router' }, host);
      // Nothing in the fragment yet: the app is at its own root.
      expect(history.url).toBe('/');

      history.push('/mail/2');
      expect(host.hrefs).toEqual(['/playground#example-router/mail/2']);
      expect(history.url).toBe('/mail/2');
    });

    it('leaves the page path and query alone', () => {
      const host = fakeWindow('/playground?debug=1');
      const history = createShellHistory({ mode: 'hash', base: 'app' }, host);
      history.push('/mail');
      expect(host.hrefs).toEqual(['/playground?debug=1#app/mail']);
    });

    it('reads the base alone as the app root', () => {
      const host = fakeWindow('/playground#example-router');
      const history = createShellHistory({ mode: 'hash', base: 'example-router' }, host);
      expect(history.url).toBe('/');
    });

    it('reports the app root for a fragment that belongs to something else', () => {
      const host = fakeWindow('/playground#some-other-route');
      const history = createShellHistory({ mode: 'hash', base: 'example-router' }, host);
      expect(history.url).toBe('/');
    });

    it('reports a hashchange, which a typed fragment produces and popstate does not', () => {
      const host = fakeWindow('/playground#app');
      const history = createShellHistory({ mode: 'hash', base: 'app' }, host);
      const seen: string[] = [];
      history.onChange(url => seen.push(url));

      host.location.hash = '#app/mail/4';
      host.fire('hashchange');
      expect(seen).toEqual(['/mail/4']);
    });

    it('does not report back the url it just wrote', () => {
      const host = fakeWindow('/playground#app');
      const history = createShellHistory({ mode: 'hash', base: 'app' }, host);
      const seen: string[] = [];
      history.onChange(url => seen.push(url));

      history.push('/mail/1');
      host.fire('hashchange');
      expect(seen).toEqual([]);
    });

    it('works with no base, when the app owns the whole fragment', () => {
      const host = fakeWindow('/#/mail/8');
      const history = createShellHistory({ mode: 'hash' }, host);
      expect(history.url).toBe('/mail/8');
    });

    it('stops listening when disposed', () => {
      const host = fakeWindow('/playground#app');
      const history = createShellHistory({ mode: 'hash', base: 'app' }, host);
      const seen: string[] = [];
      history.onChange(url => seen.push(url));
      history.dispose();

      host.location.hash = '#app/mail';
      host.fire('hashchange');
      expect(seen).toEqual([]);
    });
  });
});

/**
 * Whose history it is, which decides who may dispose it.
 *
 * Made from options, it is the app's and goes with the app. Handed in,
 * it belongs to the host that made it — an embedding page whose
 * address bar the app does not own — and outlives the app.
 */
describe('resolveShellHistory', () => {
  function given(): ShellHistory & { readonly disposed: ReturnType<typeof vi.fn> } {
    let listener: ((url: string) => void) | null = null;
    const disposed = vi.fn();
    return {
      url: '/given',
      push: () => {},
      replace: () => {},
      back: () => listener?.('/back'),
      forward: () => {},
      onChange: next => {
        listener = next;
      },
      dispose: disposed,
      disposed
    };
  }

  it('makes a history from options, and owns it', () => {
    const resolved = resolveShellHistory({ mode: 'memory', initialUrl: '/made' });

    expect(resolved.history.url).toBe('/made');
    expect(resolved.owned).toBe(true);
  });

  it('makes one from nothing at all, as before', () => {
    const resolved = resolveShellHistory(undefined);

    expect(resolved.history.url).toBe('/');
    expect(resolved.owned).toBe(true);
  });

  it('uses a history it was handed as it is, and does not own it', () => {
    const history = given();

    const resolved = resolveShellHistory(history);

    expect(resolved.history).toBe(history);
    expect(resolved.owned).toBe(false);
  });

  it('releases a handed-in history by silencing it rather than disposing it', () => {
    const history = given();
    const seen: string[] = [];
    history.onChange(url => seen.push(url));

    releaseShellHistory(history, false);
    history.back();

    expect(history.disposed).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('disposes a history it made', () => {
    const history = given();

    releaseShellHistory(history, true);

    expect(history.disposed).toHaveBeenCalledOnce();
  });
});

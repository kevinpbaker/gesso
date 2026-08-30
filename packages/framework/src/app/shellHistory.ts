/**
 * The window's address, as the only thing routing needs from a shell.
 *
 * A render worker has no `location` and no `history`, so a routed app
 * exchanges exactly one kind of value with the thread that does: a
 * url string, outward when the app navigates and inward when the back
 * button, the forward button or a typed address changes it. Everything
 * else about routing — patterns, params, guards, which screen — stays
 * in the worker, where the components are.
 *
 * Three modes, because a Gesso app runs in three kinds of window:
 *
 * - `path` — `pushState` against the document's path. What a web app
 *   deployed at its own origin wants, and the default.
 * - `hash` — the app's url lives in the fragment, after an optional
 *   `base`. For an app that shares a page with something else that
 *   owns the path — the playground, whose own routes are hashes — and
 *   for a static host that will not rewrite unknown paths onto the
 *   app.
 * - `memory` — no window involvement at all. What a desktop window
 *   (roadmap E1) wants, since it has no address bar to sync with, and
 *   what a test wants.
 */
export type ShellHistoryMode = 'path' | 'hash' | 'memory';

export interface ShellHistoryOptions {
  readonly mode?: ShellHistoryMode;
  /**
   * `hash` mode only: what the app's url follows in the fragment.
   *
   * With `base: 'example-router'` the app's `/mail/2` is the whole
   * page's `#example-router/mail/2`, which leaves the first segment to
   * whatever else on the page is reading the hash.
   */
  readonly base?: string;
  /** `memory` mode only: where the app starts. Defaults to `/`. */
  readonly initialUrl?: string;
}

export interface ShellHistory {
  /** The url the window is at now. */
  readonly url: string;
  push(url: string): void;
  replace(url: string): void;
  back(): void;
  forward(): void;
  /** Reports urls the person produced: back, forward, or a typed address. */
  onChange(listener: (url: string) => void): void;
  dispose(): void;
}

/**
 * Just the parts of a window this module uses.
 *
 * A parameter rather than the global so the browser modes can be
 * tested the way `EditingProxy` is: the contract with the DOM is
 * small, and stating it is what makes it assertable.
 */
export interface HistoryWindow {
  readonly location: { pathname: string; search: string; hash: string };
  readonly history: {
    pushState(data: unknown, title: string, url: string): void;
    replaceState(data: unknown, title: string, url: string): void;
    back(): void;
    forward(): void;
  };
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export function createShellHistory(
  options: ShellHistoryOptions = {},
  host: HistoryWindow | undefined = typeof window === 'undefined' ? undefined : (window as unknown as HistoryWindow)
): ShellHistory {
  const mode = options.mode ?? (host === undefined ? 'memory' : 'path');
  if (mode === 'memory' || host === undefined) {
    return new MemoryHistory(options.initialUrl ?? '/');
  }
  return new BrowserHistory(host, mode, options.base ?? '');
}

class MemoryHistory implements ShellHistory {
  private readonly entries: string[];
  private index = 0;
  private listener: ((url: string) => void) | null = null;

  constructor(initialUrl: string) {
    this.entries = [initialUrl];
  }

  get url(): string {
    return this.entries[this.index]!;
  }

  push(url: string): void {
    this.entries.length = this.index + 1;
    this.entries.push(url);
    this.index = this.entries.length - 1;
  }

  replace(url: string): void {
    this.entries[this.index] = url;
  }

  back(): void {
    this.step(-1);
  }

  forward(): void {
    this.step(1);
  }

  onChange(listener: (url: string) => void): void {
    this.listener = listener;
  }

  dispose(): void {
    this.listener = null;
  }

  private step(delta: number): void {
    const next = this.index + delta;
    if (next < 0 || next >= this.entries.length) {
      return;
    }
    this.index = next;
    this.listener?.(this.url);
  }
}

/**
 * The two browser modes, which differ only in where the url is kept.
 *
 * Both write with `history.pushState`/`replaceState` — in hash mode
 * too, rather than by assigning `location.hash`, because assignment
 * cannot replace an entry and would leave every navigation in the back
 * stack whether the app asked for that or not.
 */
class BrowserHistory implements ShellHistory {
  private listener: ((url: string) => void) | null = null;
  private readonly onPopState: () => void;
  private readonly onHashChange: () => void;
  /**
   * The last url this class wrote.
   *
   * `pushState` fires neither `popstate` nor `hashchange`, so in a
   * browser nothing echoes; this is here for the hosts that do not
   * honour that — an embedded webview, a test — where an echo would
   * otherwise come back as a navigation the person never made. It is
   * cleared on the first event that is not the echo.
   */
  private written: string | null = null;

  constructor(
    private readonly host: HistoryWindow,
    private readonly mode: 'path' | 'hash',
    private readonly base: string
  ) {
    this.onPopState = () => this.report();
    this.onHashChange = () => this.report();
    host.addEventListener('popstate', this.onPopState);
    if (mode === 'hash') {
      // A fragment typed into the address bar changes no history entry,
      // so popstate alone would miss it.
      host.addEventListener('hashchange', this.onHashChange);
    }
  }

  get url(): string {
    const location = this.host.location;
    return this.mode === 'path' ? `${location.pathname}${location.search}` : this.fromHash();
  }

  push(url: string): void {
    this.written = url;
    this.host.history.pushState(null, '', this.toHref(url));
  }

  replace(url: string): void {
    this.written = url;
    this.host.history.replaceState(null, '', this.toHref(url));
  }

  back(): void {
    this.host.history.back();
  }

  forward(): void {
    this.host.history.forward();
  }

  onChange(listener: (url: string) => void): void {
    this.listener = listener;
  }

  dispose(): void {
    this.listener = null;
    this.host.removeEventListener('popstate', this.onPopState);
    this.host.removeEventListener('hashchange', this.onHashChange);
  }

  private report(): void {
    const url = this.url;
    if (url === this.written) {
      return;
    }
    this.written = null;
    this.listener?.(url);
  }

  private toHref(url: string): string {
    if (this.mode === 'path') {
      return url;
    }
    // The path and query the page was served at are kept: in hash mode
    // the app owns the fragment and nothing else.
    const location = this.host.location;
    return `${location.pathname}${location.search}#${this.base}${url}`;
  }

  private fromHash(): string {
    const hash = this.host.location.hash.replace(/^#/, '');
    if (this.base.length === 0) {
      return hash.length === 0 ? '/' : ensureLeadingSlash(hash);
    }
    if (hash === this.base) {
      return '/';
    }
    if (!hash.startsWith(`${this.base}/`)) {
      // The fragment belongs to something else on the page; the app is
      // at its own root rather than at a url it cannot read.
      return '/';
    }
    return ensureLeadingSlash(hash.slice(this.base.length));
  }
}

function ensureLeadingSlash(url: string): string {
  return url.startsWith('/') ? url : `/${url}`;
}

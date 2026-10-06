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
 * wants, since it has no address bar to sync with, and
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

/**
 * A url kept somewhere, which the shell reads, writes and listens to.
 *
 * `createShellHistory` makes one from `ShellHistoryOptions`, and that
 * covers every window the app owns the address of. An app embedded in
 * a page whose address belongs to something else does not own it: an
 * Atlassian Forge Custom UI app runs in an iframe inside Jira, and the
 * only way to Jira's address bar is the history object Forge's bridge
 * hands out. Such a host implements this interface over whatever it
 * has, and passes the object as the app's `history` option in place of
 * options, so the router and the host's address bar stay one url.
 */
export interface ShellHistory {
  /** The url the window is at now. */
  readonly url: string;
  push(url: string): void;
  replace(url: string): void;
  back(): void;
  forward(): void;
  /**
   * Reports urls the person produced: back, forward, or a typed address.
   *
   * There is one listener, and a second call replaces the first. An
   * app that was handed its history and is being taken down relies on
   * that to stop listening, since disposing a history it did not make
   * is not its decision.
   */
  onChange(listener: (url: string) => void): void;
  dispose(): void;
  /**
   * The address a new tab would open to show the app at `url`, or null
   * when this history has none to give.
   *
   * Asked when a link is followed somewhere new (`ShellService.openRoute`,
   * a Cmd-click or a Ctrl-click). The browser modes answer with the
   * document address that holds `url`, which is what `push` would have
   * written; `memory` answers null, because a url kept in memory names
   * no page anything else could load. Optional, because a history an
   * embedder wrote may have no such answer either, and leaving it out
   * says exactly that: the shell then follows the link in place. A
   * host that can open its own kind of tab (Jira's, through Forge's
   * `router.open`) says so with the shell's `onOpenRoute` instead.
   */
  href?(url: string): string | null;
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

/**
 * The history an app runs against, and whether the app may dispose it.
 *
 * Options are turned into a history here, and that history is the
 * app's to dispose with everything else it made. A history passed in
 * ready-made is used as it is and left alone at the end, by the rule
 * `appLogicWorker` already follows: what the app made, it disposes;
 * what it was handed, it leaves to whoever handed it. That is also
 * what keeps a host's history alive across a remount, which disposes
 * the app and builds it again around the same object.
 */
export function resolveShellHistory(source: ShellHistoryOptions | ShellHistory | undefined): {
  readonly history: ShellHistory;
  readonly owned: boolean;
} {
  if (isShellHistory(source)) {
    return { history: source, owned: false };
  }
  return { history: createShellHistory(source), owned: true };
}

/**
 * Tells a ready-made history from options by its methods.
 *
 * Options are plain data and never carry a function, so the presence of
 * `push` and `onChange` as functions is unambiguous. It is checked by
 * behaviour rather than by `instanceof` because the histories worth
 * passing are adapters an embedder wrote, not classes from here.
 */
function isShellHistory(value: ShellHistoryOptions | ShellHistory | undefined): value is ShellHistory {
  return (
    value !== undefined &&
    typeof (value as Partial<ShellHistory>).push === 'function' &&
    typeof (value as Partial<ShellHistory>).onChange === 'function'
  );
}

/**
 * Opens the app at `url` somewhere new, as the shell's answer to
 * `ShellService.openRoute`.
 *
 * In this order, and the order is the decision. A host's own handler
 * wins, because an app embedded in another product or in a desktop
 * window knows what a new tab means there and a browser default would
 * be wrong in both. Without one, the history is asked for the address
 * that holds `url`, and that address is opened. Without an address,
 * which is `memory` mode and any handed-in history with no `href`, the
 * link is followed in place: a Cmd-click that did nothing at all would
 * read as a broken link, and arriving at the destination in the window
 * already open is what a browser does with a modifier it cannot honour.
 *
 * Shared by `WorkerApp` and `GessoApp`, which differ only in how a url
 * reaches the router, so it is passed in.
 */
export function openRouteWith(
  handler: ((url: string) => void) | undefined,
  url: string,
  history: ShellHistory | null,
  open: (address: string) => void,
  followInPlace: (url: string) => void
): void {
  if (handler !== undefined) {
    handler(url);
    return;
  }
  const address = history?.href?.(url) ?? null;
  if (address !== null) {
    open(address);
    return;
  }
  followInPlace(url);
}

/**
 * Stops an app hearing about a history it is done with.
 *
 * A history the app made is disposed, which drops its listeners and
 * its window events with it. One it was handed is not the app's to
 * dispose, so the listener is replaced with one that does nothing:
 * the host's history goes on working, and a back button pressed after
 * the app is gone no longer reaches it.
 */
export function releaseShellHistory(history: ShellHistory, owned: boolean): void {
  if (owned) {
    history.dispose();
  } else {
    history.onChange(() => {});
  }
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

  /** No address: a url kept here names no page another tab could load. */
  href(): string | null {
    return null;
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

  /**
   * The address `push` would write for `url`, for a new tab to open.
   *
   * Relative, as `pushState` takes it, and resolved against the page by
   * whatever opens it: `/epic/2` in `path` mode, and the page's own
   * path and query with the fragment set in `hash` mode, so the new tab
   * loads the same document and starts on the same screen.
   */
  href(url: string): string | null {
    return this.toHref(url);
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

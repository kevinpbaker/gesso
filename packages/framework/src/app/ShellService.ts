import { internalState } from '../InternalState';
import type { ColorScheme } from './colorScheme';
import type { ReadableCell } from '../Input';

/**
 * Something only the shell — the thread with a window — can do.
 *
 * The `history` variant is the router's, not a component's: a
 * component navigates through `RouterService`, which turns the
 * navigation into one of these because the address bar is on the other
 * thread. It is here rather than in a protocol of its own because it
 * is the same kind of thing as the other two — a request the render
 * thread cannot serve itself — and `GessoApp` and `WorkerApp` already
 * have exactly one place that answers them.
 */
export type ShellRequest =
  | { type: 'clipboard'; text: string }
  | { type: 'openUrl'; url: string }
  | { type: 'popup'; id: number; url: string; name: string; width: number; height: number }
  | { type: 'storage'; id: number; op: ShellStorageOp; key: string; value?: string }
  | { type: 'history'; action: 'push' | 'replace'; url: string }
  | { type: 'history'; action: 'back' | 'forward'; url?: undefined };

/** The four things `localStorage` is asked for; see `ShellStorage`. */
export type ShellStorageOp = 'read' | 'write' | 'remove' | 'keys';

/**
 * What the shell made of a storage request.
 *
 * One record with a field per shape of answer, rather than four reply
 * messages: it is plain data either way, and a single reply keeps the
 * pairing with `id` in one place. `value` is a read's, `keys` is a
 * listing's, and both are empty for a write.
 */
export interface ShellStorageResult {
  readonly outcome: 'ok' | 'denied' | 'full' | 'failed';
  readonly value: string | null;
  readonly keys: readonly string[];
  /** Why it did not answer, as a message; null when it did. */
  readonly error: string | null;
}

/**
 * The shell's services, as a store components can inject.
 *
 * A component in the render worker has no clipboard and no window.
 * Dispatching an action here hands the request to the runtime, which
 * forwards it to whichever host it has: `WorkerApp` posts it to the
 * main thread, `GessoApp` performs it directly. Every runtime registers
 * one, like `OverlayService`; being a store keeps the rule that
 * components reach the outside world through actions only, and gives a
 * desktop shell (roadmap E1) one place to bind native equivalents.
 */
export class ShellService {
  private handler: ((request: ShellRequest) => void) | null = null;
  private readonly scheme = internalState<ColorScheme>('light');
  /** Popups asked for and not yet answered, by the id sent with each. */
  private readonly popups = new Map<number, (opened: boolean) => void>();
  private nextPopupId = 1;
  /** Storage requests asked for and not yet answered, by the id sent with each. */
  private readonly stores = new Map<number, (result: ShellStorageResult) => void>();
  private nextStorageId = 1;

  /**
   * The appearance the platform is asking for, as the shell reports it:
   * once when the app starts, and again whenever it changes.
   *
   * Read-only to the application on purpose. Nothing in the framework
   * consumes this — no built-in theme switches on it, and nothing in
   * layout, paint or input reads it — so the only writer is the shell,
   * and a cell an application could also write would be a cell the next
   * media-query change silently overwrites.
   *
   * What it means is the application's to decide. A theme is an
   * ordinary prop that accepts an Observable, so the whole of following
   * the platform is:
   *
   *   const theme = ctx.inject(ShellService).colorScheme.pipe(
   *     map(scheme => (scheme === 'dark' ? darkTheme : lightTheme))
   *   );
   *
   * An app with its own light/dark control keeps that choice as
   * application state — a channel or a store, like any other preference
   * that outlives a screen — and combines it with this. The framework
   * does not decide what dark looks like, and does not remember what
   * the person picked.
   */
  /**
   * A cell rather than a bare Observable, so `computed(() => ...)` can
   * read it beside a channel's view; its setter stays private here.
   */
  readonly colorScheme: ReadableCell<ColorScheme> = this.scheme;

  /** The current appearance, for code that needs it without subscribing. */
  get currentColorScheme(): ColorScheme {
    return this.scheme.value;
  }

  /** Installed by the runtime; a request with no handler is dropped. */
  setHandler(handler: ((request: ShellRequest) => void) | null): void {
    this.handler = handler;
  }

  /**
   * Called by the runtime when the shell reports the appearance.
   *
   * Not for applications: the shell is the only thing that knows the
   * answer, and `colorScheme` is how an application hears about it.
   */
  applyColorScheme(scheme: ColorScheme): void {
    if (this.scheme.value !== scheme) {
      this.scheme.value = scheme;
    }
  }

  /** Puts text on the system clipboard. */
  copyText(text: string): void {
    this.handler?.({ type: 'clipboard', text });
  }

  /** Opens a URL in the user's browser, in a new tab or window. */
  openUrl(url: string): void {
    this.handler?.({ type: 'openUrl', url });
  }

  /**
   * Opens a sized window and answers whether the browser allowed it.
   *
   * Separate from `openUrl` because the two differ in three ways that
   * matter. A popup is a small window rather than a tab, so it carries
   * a size; it is named, so asking twice reuses one window rather than
   * littering the desktop; and the caller has to hear whether it opened,
   * because a blocked popup is a dead end an application must route
   * around rather than a request it can post and forget.
   *
   * The answer is a promise, the one place in the framework where a
   * shell request has a reply, because there is nothing useful an
   * application can do with a popup it cannot see the fate of. A sign-in
   * flow that is blocked falls back to a full-page redirect, and it can
   * only choose that if it is told.
   *
   * Two browser rules shape the contract and both were measured in
   * Chrome before this existed:
   *
   * - The window must be asked for while the click that prompted it is
   *   still fresh, so the request travels ahead of any slow work. A
   *   round trip through a worker is fast enough; resolving a url over
   *   the network first is not, so build the url before calling this.
   * - One gesture buys one window. A second call on the same click is
   *   refused by the browser and resolves `false`.
   *
   * The window is opened *with* an opener, unlike `openUrl`, which
   * passes `noopener`. That is not a relaxation for its own sake:
   * `window.open` returns `null` when `noopener` is set whether or not
   * the window appeared, so a popup asked for that way could never
   * report the one thing this method exists to report. The opened page
   * is a different origin, so what the opener reference grants it is
   * what any OAuth popup's does.
   */
  openPopup(request: {
    readonly url: string;
    readonly name?: string;
    readonly width?: number;
    readonly height?: number;
  }): Promise<boolean> {
    const handler = this.handler;
    if (handler === undefined || handler === null) {
      // No shell, so no window; a headless runtime says so rather than
      // leaving a promise that never settles.
      return Promise.resolve(false);
    }
    const id = this.nextPopupId++;
    const settled = new Promise<boolean>(resolve => {
      this.popups.set(id, resolve);
    });
    handler({
      type: 'popup',
      id,
      url: request.url,
      name: request.name ?? 'gesso-popup',
      width: request.width ?? 520,
      height: request.height ?? 680
    });
    return settled;
  }

  /**
   * Called by the runtime when the shell reports what became of a
   * popup. Not for applications.
   *
   * An id the map does not hold is ignored rather than thrown on: a
   * duplicate reply, or one arriving after the runtime was torn down,
   * is the shell being noisy and not the application being wrong.
   */
  settlePopup(id: number, opened: boolean): void {
    const resolve = this.popups.get(id);
    if (resolve === undefined) {
      return;
    }
    this.popups.delete(id);
    resolve(opened);
  }

  /**
   * Asks the shell to read, write, remove or list in `localStorage`.
   *
   * `localStorage` is on the window and nowhere else: a worker cannot
   * reach it, so a render thread that wants it has to ask, exactly as
   * it asks for the clipboard. What comes back is plain data, and the
   * shell decides nothing beyond performing the call, which is the
   * rule `decisions/0030` holds it to.
   *
   * `ShellStorage` is what an application uses; this is the wire under
   * it. With no shell installed the answer is `denied`, because a
   * headless runtime has no window and never will, and a promise left
   * unsettled would hang whatever was waiting on it.
   */
  requestStorage(request: {
    readonly op: ShellStorageOp;
    readonly key: string;
    readonly value?: string;
  }): Promise<ShellStorageResult> {
    const handler = this.handler;
    if (handler === undefined || handler === null) {
      return Promise.resolve({
        outcome: 'denied',
        value: null,
        keys: [],
        error: 'There is no shell to store through.'
      });
    }
    const id = this.nextStorageId++;
    const settled = new Promise<ShellStorageResult>(resolve => {
      this.stores.set(id, resolve);
    });
    handler({
      type: 'storage',
      id,
      op: request.op,
      key: request.key,
      ...(request.value === undefined ? {} : { value: request.value })
    });
    return settled;
  }

  /**
   * Called by the runtime with what the shell found. Not for
   * applications.
   *
   * An id the map does not hold is ignored, on the same terms as
   * `settlePopup`: a duplicate reply is the shell being noisy rather
   * than the application being wrong.
   */
  settleStorage(id: number, result: ShellStorageResult): void {
    const resolve = this.stores.get(id);
    if (resolve === undefined) {
      return;
    }
    this.stores.delete(id);
    resolve(result);
  }
}

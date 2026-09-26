import { insetsEqual, noInsets, type UiInsets } from 'gesso-core';

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
  | { type: 'fullscreen'; enter: boolean }
  | { type: 'popup'; id: number; url: string; name: string; width: number; height: number }
  | { type: 'storage'; id: number; op: ShellStorageOp; key: string; value?: string }
  | { type: 'file'; id: number; request: ShellFileRequest }
  | { type: 'history'; action: 'push' | 'replace'; url: string }
  | { type: 'history'; action: 'back' | 'forward'; url?: undefined };

/**
 * A kind of file a picker offers, as the File System Access API and a
 * file input both understand it.
 *
 * `extensions` include the dot (`.csv`), because that is the form both
 * APIs take and a spelling this layer translated would be one more
 * place for the two to disagree.
 */
export interface ShellFileType {
  readonly description: string;
  readonly mediaType: string;
  readonly extensions: readonly string[];
}

/**
 * What the shell is asked to do with files.
 *
 * `handle` is a number the shell hands out for a file somebody picked
 * — the `FileSystemFileHandle` itself cannot leave the main thread,
 * since nothing that is not plain data crosses the barrier. The shell
 * keeps the handle and remembers it across reloads, so a number from
 * yesterday's session still names yesterday's file.
 */
export type ShellFileRequest =
  /** Show an open picker. */
  | { readonly op: 'open'; readonly accept: readonly ShellFileType[]; readonly multiple: boolean }
  /** Read a file the shell already has a handle to, asking permission again if it lapsed. */
  | { readonly op: 'reopen'; readonly handle: number }
  /**
   * Write a file: to `handle` when given, and otherwise to wherever a
   * save picker says — or, where there is no picker, as a download.
   */
  | {
      readonly op: 'save';
      readonly name: string;
      readonly mediaType: string;
      readonly text: string;
      /**
       * The file's bytes, for one that is not text — a zip, an image.
       * Written instead of `text` when given; bytes cross the barrier
       * as they do on the way in, in `ShellFile.bytes`.
       */
      readonly bytes?: Uint8Array<ArrayBuffer>;
      readonly handle?: number;
      readonly accept: readonly ShellFileType[];
    }
  /** The files the shell remembers, most recently used first. */
  | { readonly op: 'recent' }
  /** Stop remembering one. */
  | { readonly op: 'forget'; readonly handle: number };

/** One file the shell read. */
export interface ShellFile {
  readonly name: string;
  readonly mediaType: string;
  readonly lastModified: number;
  readonly bytes: ArrayBuffer;
  /** The shell's number for it, or null where the platform gives none (a file input). */
  readonly handle: number | null;
}

/** A file the shell remembers. */
export interface ShellRecentFile {
  readonly handle: number;
  readonly name: string;
  /** When it was last opened or saved, in epoch milliseconds. */
  readonly used: number;
}

/**
 * What the shell made of a file request.
 *
 * One record with a field per shape of answer, as `ShellStorageResult`
 * is and for the same reason. `cancelled` is its own outcome because a
 * person closing a picker is a decision and not a failure, and an
 * application that reported it as one would be wrong every time.
 * `denied` is a permission refused; `unsupported` is a shell with no
 * way to do it at all.
 */
export interface ShellFileResult {
  readonly outcome: 'ok' | 'cancelled' | 'denied' | 'unsupported' | 'failed';
  /** What `open` and `reopen` read. */
  readonly files: readonly ShellFile[];
  /** Where `save` wrote: `'file'` through a handle, `'download'` without one. */
  readonly saved: { readonly name: string; readonly handle: number | null; readonly via: 'file' | 'download' } | null;
  /** What `recent` lists. */
  readonly recent: readonly ShellRecentFile[];
  /** Why it did not answer, as a message; null when it did. */
  readonly error: string | null;
}

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
 * desktop shell one place to bind native equivalents.
 */
export class ShellService {
  private handler: ((request: ShellRequest) => void) | null = null;
  private readonly scheme = internalState<ColorScheme>('light');
  private readonly insets = internalState<UiInsets>(noInsets);
  private readonly isFullscreen = internalState<boolean>(false);
  /** Popups asked for and not yet answered, by the id sent with each. */
  private readonly popups = new Map<number, (opened: boolean) => void>();
  private nextPopupId = 1;
  /** Storage requests asked for and not yet answered, by the id sent with each. */
  private readonly stores = new Map<number, (result: ShellStorageResult) => void>();
  private nextStorageId = 1;
  /** File requests asked for and not yet answered, by the id sent with each. */
  private readonly files = new Map<number, (result: ShellFileResult) => void>();
  private nextFileId = 1;

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

  /**
   * What the platform itself is covering on each edge, as the shell
   * reports it: the safe area under a notch or a home indicator, and
   * the strip a soft keyboard has slid over. Zeroes on a desktop window
   * with neither, and zeroes until a shell has said otherwise.
   *
   * Read-only to the application for the same reason `colorScheme` is:
   * the shell is the only thing that knows, and a cell an application
   * could also write is a cell the next keyboard event overwrites.
   *
   * Most applications never read this. The runtime publishes the same
   * four numbers into the inset registry the root provides, so a
   * screen that keeps clear of the bars with `insetPadding` keeps
   * clear of the keyboard too without naming it. This is for the
   * application that provides its registry somewhere other than the
   * root, or wants the platform's numbers apart from its own bars'.
   */
  readonly viewportInsets: ReadableCell<UiInsets> = this.insets;

  /** The platform's current insets, for code that needs them without subscribing. */
  get currentViewportInsets(): UiInsets {
    return this.insets.value;
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

  /**
   * Called by the runtime when the shell reports the platform's insets.
   *
   * Not for applications, on the terms `applyColorScheme` sets. A
   * report that changes nothing is dropped here, so a `visualViewport`
   * scroll event that moved no edge does not wake every subscriber.
   */
  applyViewportInsets(insets: UiInsets): void {
    if (!insetsEqual(this.insets.value, insets)) {
      this.insets.value = insets;
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
   * Whether the application's surface is filling the screen.
   *
   * Read rather than assumed: the person can leave fullscreen with
   * Escape, which no request here hears about, and a button that
   * tracked its own last press would then point the wrong way. The
   * shell reports the real state and this follows it.
   */
  readonly fullscreen: ReadableCell<boolean> = this.isFullscreen;

  /**
   * Asks the shell to fill the screen, or to stop.
   *
   * A request rather than a call, for the reason the clipboard is one:
   * the Fullscreen API is the document's, and the thread this runs on
   * may not have a document. It can also be refused outright, because
   * browsers only grant it during a gesture, which is why nothing here
   * returns a promise pretending otherwise. Watch `fullscreen` for what
   * actually happened.
   */
  requestFullscreen(enter: boolean): void {
    this.handler?.({ type: 'fullscreen', enter });
  }

  /** Called by the runtime when the shell reports the state. Not for applications. */
  applyFullscreen(active: boolean): void {
    if (this.isFullscreen.value !== active) {
      this.isFullscreen.value = active;
    }
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
   * rule the thread model holds it to.
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

  /**
   * Shows an open picker and reads what was picked.
   *
   * A request, like a popup, and for the same reason: a picker is the
   * window's, and a browser shows one only while the click that asked
   * for it is fresh. Call this from the handler of that click and
   * before any slow work, and the round trip through a worker is fast
   * enough. With the File System Access API each file comes back with
   * a `handle` the shell remembers; through a file input, which is
   * what a browser without the API has, `handle` is null and the file
   * cannot be saved back to.
   */
  openFiles(
    options: { readonly accept?: readonly ShellFileType[]; readonly multiple?: boolean } = {}
  ): Promise<ShellFileResult> {
    return this.requestFile({ op: 'open', accept: options.accept ?? [], multiple: options.multiple ?? false });
  }

  /**
   * Reads a file the shell has a handle to — from `recentFiles`, or
   * from an earlier `openFiles` or `saveFile` — asking for permission
   * again when the browser has let it lapse, which it does across a
   * reload. Asking needs a gesture, so this belongs in a click handler
   * too.
   */
  reopenFile(handle: number): Promise<ShellFileResult> {
    return this.requestFile({ op: 'reopen', handle });
  }

  /**
   * Writes text, or bytes, to a file.
   *
   * With `handle`, to that file, which is Save; without one, to
   * wherever a save picker says, which is Save As. A browser with no
   * picker gets a download instead, and `saved.via` says which
   * happened, so an application can tell the person where the file
   * went — and knows it has no handle to save back to next time.
   */
  saveFile(options: {
    readonly name: string;
    /** What to write, for a text file. */
    readonly text?: string;
    /** What to write, for any other kind; taken over `text` when both are given. */
    readonly bytes?: Uint8Array<ArrayBuffer>;
    readonly mediaType?: string;
    readonly handle?: number;
    readonly accept?: readonly ShellFileType[];
  }): Promise<ShellFileResult> {
    return this.requestFile({
      op: 'save',
      name: options.name,
      text: options.text ?? '',
      ...(options.bytes === undefined ? {} : { bytes: options.bytes }),
      mediaType: options.mediaType ?? 'application/octet-stream',
      accept: options.accept ?? [],
      ...(options.handle === undefined ? {} : { handle: options.handle })
    });
  }

  /** The files the shell remembers, most recently used first. */
  recentFiles(): Promise<ShellFileResult> {
    return this.requestFile({ op: 'recent' });
  }

  /** Stops remembering a file. Its handle means nothing afterwards. */
  forgetFile(handle: number): Promise<ShellFileResult> {
    return this.requestFile({ op: 'forget', handle });
  }

  /**
   * The wire under the five above. With no shell installed the answer
   * is `unsupported`, for the reason a storage request's is `denied`:
   * a promise left unsettled would hang whatever was waiting on it.
   */
  requestFile(request: ShellFileRequest): Promise<ShellFileResult> {
    const handler = this.handler;
    if (handler === undefined || handler === null) {
      return Promise.resolve(shellFilesUnsupported());
    }
    const id = this.nextFileId++;
    const settled = new Promise<ShellFileResult>(resolve => {
      this.files.set(id, resolve);
    });
    handler({ type: 'file', id, request });
    return settled;
  }

  /**
   * Called by the runtime with what the shell did. Not for
   * applications. An unknown id is ignored, on `settlePopup`'s terms.
   */
  settleFile(id: number, result: ShellFileResult): void {
    const resolve = this.files.get(id);
    if (resolve === undefined) {
      return;
    }
    this.files.delete(id);
    resolve(result);
  }
}

/** The answer for a shell that cannot do anything with files. */
export function shellFilesUnsupported(error = 'There is no shell to reach files through.'): ShellFileResult {
  return { outcome: 'unsupported', files: [], saved: null, recent: [], error };
}

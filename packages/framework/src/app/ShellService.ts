import type { Observable } from 'rxjs';

import { internalState } from '../InternalState';
import type { ColorScheme } from './colorScheme';

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
  | { type: 'history'; action: 'push' | 'replace'; url: string }
  | { type: 'history'; action: 'back' | 'forward'; url?: undefined };

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
  readonly colorScheme: Observable<ColorScheme> = this.scheme.asObservable();

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
}

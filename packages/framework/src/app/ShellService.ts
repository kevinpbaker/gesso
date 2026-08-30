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

  /** Installed by the runtime; a request with no handler is dropped. */
  setHandler(handler: ((request: ShellRequest) => void) | null): void {
    this.handler = handler;
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

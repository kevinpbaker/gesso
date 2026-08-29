import { Store } from '../store/Store';
import { Action } from '../store/decorators';

/**
 * Something only the shell — the thread with a window — can do.
 */
export type ShellRequest = { type: 'clipboard'; text: string } | { type: 'openUrl'; url: string };

/**
 * The shell's services, as a store components can inject.
 *
 * A component in the render worker has no clipboard and no window.
 * Dispatching an action here hands the request to the runtime, which
 * forwards it to whichever host it has: `WorkerApp` posts it to the
 * main thread, `NodalApp` performs it directly. Every runtime registers
 * one, like `OverlayStore`; being a store keeps the rule that
 * components reach the outside world through actions only, and gives a
 * desktop shell (roadmap E1) one place to bind native equivalents.
 */
export class ShellStore extends Store {
  private handler: ((request: ShellRequest) => void) | null = null;

  /** Installed by the runtime; a request with no handler is dropped. */
  setHandler(handler: ((request: ShellRequest) => void) | null): void {
    this.handler = handler;
  }

  /** Puts text on the system clipboard. */
  @Action()
  copyText(text: string): void {
    this.handler?.({ type: 'clipboard', text });
  }

  /** Opens a URL in the user's browser, in a new tab or window. */
  @Action()
  openUrl(url: string): void {
    this.handler?.({ type: 'openUrl', url });
  }
}

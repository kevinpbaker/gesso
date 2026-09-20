import { mountErrorOverlay, type ErrorOrigin } from 'gesso-devtools';
import type { AppShell } from './AppShell';

export interface RouteErrors {
  /**
   * The `onError` a route hands to `createApp`, in exactly that shape:
   * `onError: errors.report`.
   */
  report(message: string, stack?: string, origin?: ErrorOrigin): void;
  dispose(): void;
}

/**
 * How every route in this playground reports a failure.
 *
 * Each of them used to write the same two lines — a status-bar
 * sentence and a `console.error` — which between them said that
 * something had gone wrong and nothing about where. The status line
 * stays, because it is what tells you an error happened while you are
 * looking at the canvas; the overlay is what tells you which line of
 * which file, over the app that stopped working.
 *
 * `captureWindowErrors` is on because a route is not only its Gesso
 * app: the shell around it, the sidebar controls and the worker
 * spawning all run on this thread, and an exception in any of them
 * used to reach nothing but devtools.
 */
export function mountRouteErrors(shell: AppShell): RouteErrors {
  const overlay = mountErrorOverlay(shell.preview);
  const detachWindow = overlay.captureWindowErrors();
  return {
    report(message, stack, origin) {
      overlay.report(message, stack, origin);
      shell.setStatus(`Error: ${message}`);
    },
    dispose() {
      detachWindow();
      overlay.dispose();
    }
  };
}

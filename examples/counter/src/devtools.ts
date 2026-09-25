/**
 * The documented wiring for `gesso-devtools`' error overlay, in a
 * project that installs the packages the way anybody else would.
 *
 * Nothing imports this and nothing runs it. It exists to be
 * typechecked: `scripts/check-install.ts` runs `tsc --noEmit` over this
 * project against the *published* declarations with
 * `skipLibCheck: false`, so a broken `exports` map, or a type that only
 * resolves through a workspace link, fails here — from a consumer's
 * position rather than from inside the workspace. `counter.spec.ts`
 * does the same job for `gesso-testing` and can go further, because a
 * test needs no browser; an overlay does, so this stops at the types
 * and says so.
 *
 * Both configurations are here because they report different things.
 */
import { mountErrorOverlay } from 'gesso-devtools';
import { createApp, createSyncApp, type FrameworkChild } from 'gesso-framework';

/**
 * Worker-hosted: the overlay *is* the `onError` callback.
 *
 * This is the configuration that needs it most. An exception inside a
 * render worker reaches no console the page can show and leaves the
 * last good frame on the canvas, so the application looks like it is
 * working.
 */
export function mountWithOverlay(host: HTMLElement, renderWorker: () => Worker): () => void {
  const overlay = mountErrorOverlay(host);
  const dispose = createApp({ renderWorker, onError: overlay.report }).mount(host);
  return () => {
    dispose();
    overlay.dispose();
  };
}

/**
 * Single-thread: the window's own errors, plus the two the runtime
 * catches and would otherwise only log — a renderer that could not
 * draw, and an event listener that threw.
 */
export function mountSyncWithOverlay(host: HTMLElement, root: FrameworkChild): () => void {
  const overlay = mountErrorOverlay(host);
  overlay.captureWindowErrors();
  const dispose = createSyncApp(root).onError(overlay.report).mountSync(host);
  return () => {
    dispose();
    overlay.dispose();
  };
}

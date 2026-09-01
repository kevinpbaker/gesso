import { observeMediaQuery } from './mediaQuery';

/**
 * Watches the platform's reduced-motion preference.
 *
 * The preference is a main-thread fact — `matchMedia` needs a window —
 * and the runtime that owns the animations may be in a worker, so this
 * is deliberately a shell-side helper with no reference to a runtime.
 * `GessoApp` hands what it reports straight to `setReducedMotion`;
 * `WorkerApp` posts it across. Reporting once immediately matters as
 * much as reporting changes: an app started by someone who already has
 * the preference on must not animate its first screen.
 *
 * Returns a function that stops watching. See `observeMediaQuery` for
 * what happens where there is no `matchMedia` at all.
 */
export function observeReducedMotion(onChange: (reduced: boolean) => void): () => void {
  return observeMediaQuery('(prefers-reduced-motion: reduce)', onChange);
}

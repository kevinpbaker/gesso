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
 * Returns a function that stops watching. In an environment with no
 * `matchMedia` — a Node test, an old webview — it reports `false` once
 * and stops, which is the same answer the platform gives when nobody
 * has asked for less motion.
 */
export function observeReducedMotion(onChange: (reduced: boolean) => void): () => void {
  const view = typeof globalThis === 'undefined' ? undefined : (globalThis as { matchMedia?: typeof matchMedia });
  if (typeof view?.matchMedia !== 'function') {
    onChange(false);
    return () => {};
  }
  const query = view.matchMedia('(prefers-reduced-motion: reduce)');
  onChange(query.matches);
  const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
  // `addEventListener` on a MediaQueryList is the modern form; Safari
  // below 14 only has `addListener`, and WKWebView is one of the three
  // webviews E2 has to work on.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }
  const legacy = query as unknown as {
    addListener(fn: (event: MediaQueryListEvent) => void): void;
    removeListener(fn: (event: MediaQueryListEvent) => void): void;
  };
  legacy.addListener(listener);
  return () => legacy.removeListener(listener);
}

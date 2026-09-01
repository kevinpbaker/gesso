/**
 * Watching one media query, from the thread that has a window.
 *
 * Extracted from `reducedMotion.ts` when the colour scheme needed the
 * same thing: `matchMedia` needs a window, the runtime that cares may
 * be in a worker, and every such preference has to be reported *once*
 * immediately as well as on change — a person who already has the
 * preference set gets no `change` event to tell the app about it.
 *
 * Deliberately holds no reference to a runtime. `GessoApp` hands what
 * it reports straight to the runtime; `WorkerApp` posts it across.
 *
 * Returns a function that stops watching. In an environment with no
 * `matchMedia` — a Node test, an old webview — it reports `false` once
 * and stops, which is the answer the platform gives when nobody has
 * expressed the preference.
 */
export function observeMediaQuery(query: string, onChange: (matches: boolean) => void): () => void {
  const view = typeof globalThis === 'undefined' ? undefined : (globalThis as { matchMedia?: typeof matchMedia });
  if (typeof view?.matchMedia !== 'function') {
    onChange(false);
    return () => {};
  }
  const list = view.matchMedia(query);
  onChange(list.matches);
  const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
  // `addEventListener` on a MediaQueryList is the modern form; Safari
  // below 14 only has `addListener`, and WKWebView is one of the three
  // webviews E1 has to work on.
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', listener);
    return () => list.removeEventListener('change', listener);
  }
  const legacy = list as unknown as {
    addListener(fn: (event: MediaQueryListEvent) => void): void;
    removeListener(fn: (event: MediaQueryListEvent) => void): void;
  };
  legacy.addListener(listener);
  return () => legacy.removeListener(listener);
}

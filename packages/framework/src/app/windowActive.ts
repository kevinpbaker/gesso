/**
 * Watches whether the window is the one the person is using: shown, and
 * holding the keyboard focus. A window behind another, minimised, or in
 * a background tab is not.
 *
 * Shell-side, reported once at once and again on change, for the reason
 * `observeColorScheme` gives: a window that starts in the background
 * fires nothing until it is brought forward.
 */
export function observeWindowActive(onChange: (active: boolean) => void): () => void {
  let last: boolean | null = null;
  const report = (): void => {
    // A document that cannot say where the focus is (some embedded webviews, a test's stand-in) is taken to have it.
    const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    const active = document.visibilityState === 'visible' && focused;
    if (active !== last) {
      last = active;
      onChange(active);
    }
  };
  window.addEventListener('focus', report);
  window.addEventListener('blur', report);
  document.addEventListener('visibilitychange', report);
  report();
  return () => {
    window.removeEventListener('focus', report);
    window.removeEventListener('blur', report);
    document.removeEventListener('visibilitychange', report);
  };
}

/**
 * Hears the window's device pixel ratio change while its size does not.
 *
 * A window dragged from a laptop's screen to an external monitor keeps
 * its size in CSS pixels, so no `ResizeObserver` fires, but each CSS
 * pixel is now a different number of device pixels. A canvas sized for
 * the old ratio is drawn blurred, or scaled, until something else
 * happens to resize it. The browser says when the ratio changes only
 * through a media query for the ratio it had, which stops matching; so
 * each change is heard once and the query is made again for the new
 * ratio.
 *
 * @returns A function that stops listening.
 */
export function watchPixelRatio(
  onChange: (dpr: number) => void,
  view: Pick<Window, 'matchMedia' | 'devicePixelRatio'> | undefined = globalThis.window
): () => void {
  if (view === undefined || typeof view.matchMedia !== 'function') {
    return () => {};
  }
  let query: MediaQueryList | null = null;
  let stopped = false;
  const listen = (): void => {
    query = view.matchMedia(`(resolution: ${view.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', changed, { once: true });
  };
  function changed(): void {
    if (stopped) {
      return;
    }
    onChange(view!.devicePixelRatio || 1);
    listen();
  }
  listen();
  return () => {
    stopped = true;
    query?.removeEventListener('change', changed);
  };
}

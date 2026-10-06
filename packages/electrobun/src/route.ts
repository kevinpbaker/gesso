/**
 * How a new window learns the route it opens at.
 *
 * A desktop window keeps its routes in memory (`history: { mode:
 * 'memory' }`), so there is no address the main process could open
 * it at. What it can choose is the url of the page it loads, and the
 * page can read that url before its shell starts. So the route rides
 * on the view's url, in the fragment, and the window starts its
 * memory history there: `withWindowRoute` writes it on the main
 * process's side and `windowRoute` reads it on the window's.
 *
 * The fragment rather than a query, because the fragment never leaves
 * the webview: a `views://` url is served by Electrobun's own scheme
 * handler, and a query string is one more thing that handler would
 * have to agree to ignore when it looks the file up.
 *
 * Read once, at start-up, rather than sent as a frame after the window
 * has spoken. A frame would arrive after the shell had already started
 * at `/`, and the window would draw the root first and then jump.
 */

/** The fragment parameter the route is carried in. */
const ROUTE_PARAM = 'gesso-route';

/**
 * The view's url, carrying `route` for the window to start at.
 *
 * `route` null or absent leaves the url as it was, so a window opened
 * without one loads exactly what it always did. A fragment already on
 * the url is replaced: it is the page's address inside a window that
 * has no address bar, and nothing else reads it.
 */
export function withWindowRoute(viewUrl: string, route: string | null | undefined): string {
  if (route === null || route === undefined) {
    return viewUrl;
  }
  const at = viewUrl.indexOf('#');
  const base = at === -1 ? viewUrl : viewUrl.slice(0, at);
  return `${base}#${ROUTE_PARAM}=${encodeURIComponent(route)}`;
}

/**
 * The route this window was opened at, or `/`.
 *
 * Pass it as the shell's starting url:
 *
 *   createApp({ history: { mode: 'memory', initialUrl: windowRoute() }, … })
 *
 * `hash` defaults to the page's own; a parameter so that it can be
 * specified without a window.
 */
export function windowRoute(hash: string = globalThis.location?.hash ?? ''): string {
  const route = new URLSearchParams(hash.replace(/^#/, '')).get(ROUTE_PARAM);
  return route === null || route.length === 0 ? '/' : route;
}

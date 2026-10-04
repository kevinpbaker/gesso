/**
 * The shell's half of `ShellService.redirect`: the page is replaced
 * with a url a component asked for.
 *
 * Both hosts answer the request — `WorkerApp` when it arrives as a
 * message, `GessoApp` when the runtime hands it over on the same
 * thread — and both go through here, so the one rule that matters is
 * written once.
 *
 * That rule is the scheme. `location.assign('javascript:…')` does not
 * go anywhere; it runs the script in the page, with everything the
 * page can reach. A component builds the url it redirects to, often
 * from data — a `returnTo` from the address bar, a link from the
 * server — and a shell that assigned whatever it was given would make
 * every such url a way to run script. So a url is resolved against
 * the page first, the way the browser would resolve it, and only an
 * http or https result, or one in the page's own scheme, is followed.
 * The page's own scheme is there for a page that is not served over
 * http at all — an Electrobun window loads from `views://` — where a
 * relative url resolves to that scheme and is no less the app's own.
 */

/** Schemes a redirect may always go to, whatever the page was served from. */
const WEB_SCHEMES = new Set(['http:', 'https:']);

/**
 * Schemes refused even when the page itself has one of them.
 *
 * A page served from `data:` or `blob:` is unusual but real — a
 * preview, a sandboxed frame — and "the page's own scheme" must not
 * then admit a `data:` url built from data, which is script by
 * another name.
 */
const REFUSED_SCHEMES = new Set(['javascript:', 'data:', 'blob:', 'about:']);

/**
 * The absolute url `url` names, resolved against `base` (the page's
 * address), or null when it is not one a redirect may follow.
 *
 * Null as well for a url that does not parse, or a base that does
 * not: a redirect nobody can resolve is refused rather than guessed.
 */
export function redirectTarget(url: string, base: string): string | null {
  let page: URL;
  let target: URL;
  try {
    page = new URL(base);
    target = new URL(url, page);
  } catch {
    return null;
  }
  if (WEB_SCHEMES.has(target.protocol)) {
    return target.href;
  }
  if (target.protocol === page.protocol && !REFUSED_SCHEMES.has(target.protocol)) {
    return target.href;
  }
  return null;
}

/**
 * Where a redirect goes once it is admitted: the host's handler when
 * it gave one, and the page's own `location.assign` otherwise.
 */
export interface RedirectLocation {
  readonly href: string;
  assign(url: string): void;
}

/**
 * Follows a redirect, or refuses it, and says which.
 *
 * The url is checked before the handler is called as well as before
 * the default: a desktop host's `onRedirect` navigates a webview, and
 * a `javascript:` url is no safer there. The handler is given the
 * resolved, absolute url, so it never has to know what page the
 * request came from.
 *
 * A refusal is a warning on the console and nothing else. There is no
 * one to report it to — the request carries no answer — and throwing
 * on the main thread would take down a message handler over a url
 * that was simply ignored.
 */
export function redirectWith(
  handler: ((url: string) => void) | undefined,
  url: string,
  location: RedirectLocation
): boolean {
  const target = redirectTarget(url, location.href);
  if (target === null) {
    console.warn(
      `[gesso] ShellService.redirect refused ${JSON.stringify(url)}: only an http, https or relative url can replace the page.`
    );
    return false;
  }
  if (handler !== undefined) {
    handler(target);
  } else {
    location.assign(target);
  }
  return true;
}

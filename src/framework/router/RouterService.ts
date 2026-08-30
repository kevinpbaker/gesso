import { distinctUntilChanged, map, type Observable } from 'rxjs';

import { internalState } from '../InternalState';
import type { RouteDefinition, RouteTarget } from './RouteDefinition';
import {
  buildPath,
  formatUrl,
  matchPattern,
  parseUrl,
  pathSegments,
  type HasNoParams,
  type RouteParams
} from './RoutePath';

/** What the router resolved a url to. */
export interface RouteMatch {
  /** The deepest route that matched: the one whose screen is the leaf. */
  readonly route: RouteDefinition;
  /** That route and its ancestors, outermost first — the outlets to render. */
  readonly chain: readonly RouteDefinition[];
  /** Every param captured along the chain, since paths are full. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly path: string;
  /** Path and query together: what the history stores. */
  readonly url: string;
}

/**
 * The half of navigation only the thread with an address bar can do.
 *
 * The runtime installs one; without it the router still works, it
 * simply keeps its history in memory. That is not a degraded mode — it
 * is exactly what a desktop window wants, and what a test wants.
 */
export interface RouterHistorySink {
  push(url: string): void;
  replace(url: string): void;
  back(): void;
  forward(): void;
}

export interface RouterRoutes {
  readonly routes: readonly RouteDefinition[];
  /**
   * Shown when no route matches. Without one an unmatched url leaves
   * `match` null and the outlet renders nothing, which is a blank
   * screen — fine for a test, wrong for an app.
   */
  readonly notFound?: RouteDefinition;
}

export interface NavigateOptions {
  readonly query?: Readonly<Record<string, string>>;
  /** Replace the current history entry instead of pushing a new one. */
  readonly replace?: boolean;
}

/**
 * What `go` takes after the route: its params, or nothing at all when
 * the path declares none.
 *
 * A rest tuple rather than an optional argument, because an optional
 * `RouteParams<Path>` for a path with no params is `{}`, and `{}`
 * accepts any object — so `go(Home, { id: '1' })` would compile and do
 * nothing. Making the argument absent is what makes it an error.
 */
export type GoArgs<Path extends string> =
  HasNoParams<Path> extends true ? [options?: NavigateOptions] : [params: RouteParams<Path>, options?: NavigateOptions];

/** How many redirects a single navigation may take before it is a bug. */
const MAX_REDIRECTS = 10;

/**
 * Routing, as a service components inject.
 *
 * Every runtime registers one, and it is inert until routes are given
 * to it — through `renderRoot(App).useRoutes(...)`, the single-thread
 * builder's `useRoutes`, or `GessoRuntimeOptions.routes`.
 *
 * It is a service and not a channel, which is the same test everything
 * else on this thread passes: a match holds `RouteDefinition` objects,
 * which hold component classes, and a component class cannot cross a
 * worker boundary. What *can* cross — a url — is what the shell
 * exchanges with it, and that is the entire wire surface of routing.
 *
 * Named `RouterService` rather than the roadmap's `RouterStore`
 * because the store/service split of `decisions/0030` renamed all six
 * of its siblings; a `Store` here would be the only one left.
 */
export class RouterService {
  /** The current url, path and query. */
  readonly url = internalState('/');
  /** What that url resolved to, or null when nothing matched. */
  readonly match = internalState<RouteMatch | null>(null);

  private routes: readonly RouteDefinition[] = [];
  private notFound: RouteDefinition | undefined;
  private history: RouterHistorySink | null = null;

  /** Installed by the runtime; without one, history is in memory. */
  setHistory(history: RouterHistorySink | null): void {
    this.history = history;
  }

  /**
   * Declares what routes exist. Re-resolves the current url, so
   * registering routes after a url has arrived is not a race.
   */
  setRoutes(routes: RouterRoutes): void {
    this.routes = routes.routes;
    this.notFound = routes.notFound;
    this.resolveInto(this.url.value, { push: false });
  }

  /** The routes this service is currently matching against. */
  get declaredRoutes(): readonly RouteDefinition[] {
    return this.routes;
  }

  /**
   * Navigates to a route, with the params its path declares.
   *
   * Typed from the route: `go(MailItem, { id: '2' })` will not compile
   * with the wrong param name, the wrong type, or none at all. A route
   * whose path has no params takes no second argument.
   */
  go<Path extends string>(route: RouteDefinition<Path>, ...args: GoArgs<Path>): void {
    const [params, options] = splitGoArgs(args);
    const path = buildPath(route.path, params);
    this.navigate(formatUrl(path, options.query), { replace: options.replace ?? false });
  }

  /** Navigates to a url, as a link would. */
  navigate(url: string, options: { replace?: boolean } = {}): void {
    this.resolveInto(url, { push: true, replace: options.replace ?? false });
  }

  /** Goes back through the shell's history; a no-op without a shell. */
  back(): void {
    this.history?.back();
  }

  /** Goes forward through the shell's history; a no-op without a shell. */
  forward(): void {
    this.history?.forward();
  }

  /**
   * The url the shell says the window is at: the first one at start-up,
   * and every one the back and forward buttons produce afterwards.
   *
   * Guards run on these too — a url typed into the address bar is
   * exactly the navigation a guard exists for — and a guard that
   * redirects replaces the entry rather than pushing, so Back does not
   * land on the url that was just refused.
   */
  applyUrl(url: string): void {
    this.resolveInto(url, { push: false });
  }

  /**
   * The params of the current match, typed from the route asked for,
   * or null when that route is not the one showing.
   *
   * A screen reads its own params with this rather than through a prop
   * so that it keeps them across a navigation that changes only the
   * params — the same instance stays mounted, and its props would have
   * had to be rebuilt to tell it.
   */
  params<Path extends string>(route: RouteDefinition<Path>): RouteParams<Path> | null {
    const match = this.match.value;
    if (match === null || !match.chain.includes(route)) {
      return null;
    }
    return match.params as RouteParams<Path>;
  }

  /** The same, as an observable, for binding a screen's title or fields. */
  observeParams<Path extends string>(route: RouteDefinition<Path>): Observable<RouteParams<Path> | null> {
    return this.match.pipe(
      map(match => (match === null || !match.chain.includes(route) ? null : (match.params as RouteParams<Path>))),
      distinctUntilChanged<RouteParams<Path> | null>((a, b) => sameParams(a, b))
    );
  }

  /**
   * Whether a route is in the current chain — true for a layout while
   * any of its children shows, which is what a nav item highlights on.
   */
  isActive(route: RouteDefinition): Observable<boolean> {
    return this.match.pipe(
      map(match => match !== null && match.chain.includes(route)),
      distinctUntilChanged()
    );
  }

  /**
   * Resolves a url, runs the guards along the way, and publishes the
   * result.
   *
   * One method for both directions of travel, because a guard's
   * redirect has to be handled the same whether the navigation came
   * from a component or from the back button.
   */
  private resolveInto(url: string, options: { push: boolean; replace?: boolean }): void {
    let target = url;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const match = this.resolve(target);
      const verdict = match === null ? true : this.runGuards(match);
      if (verdict === false) {
        // Refused with nowhere else to go: the current url stands. When
        // the refusal was of a url the shell already committed to, the
        // shell is put back where the app actually is.
        if (!options.push) {
          this.history?.replace(this.url.value);
        }
        return;
      }
      if (verdict === true) {
        this.publish(target, match, options);
        return;
      }
      target = urlOf(verdict);
      // A redirect never pushes: the refused url must not be a Back
      // target, and the redirect itself was not something the person
      // asked for.
      options = { push: options.push, replace: true };
    }
    throw new Error(`Navigating to '${url}' redirected more than ${MAX_REDIRECTS} times.`);
  }

  /**
   * Writes the result to the cells, and tells the shell what to do
   * with the address bar.
   *
   * A navigation that came from the app pushes; a redirect replaces,
   * so the refused url is not a Back target; and a url the shell
   * itself reported writes nothing back unless a guard changed it, in
   * which case the address bar would otherwise be lying.
   */
  private publish(url: string, match: RouteMatch | null, options: { push: boolean; replace?: boolean }): void {
    const settled = match?.url ?? normalize(url);
    if (options.replace === true) {
      this.history?.replace(settled);
    } else if (options.push) {
      this.history?.push(settled);
    }
    this.url.value = settled;
    this.match.value = match;
  }

  /** First declared route whose pattern describes this url wins. */
  private resolve(url: string): RouteMatch | null {
    const { path, query } = parseUrl(url);
    const segments = pathSegments(path);
    for (const route of this.routes) {
      const params = matchPattern(route.segments, segments);
      if (params !== null) {
        return { route, chain: route.chain, params, query, path, url: formatUrl(path, query) };
      }
    }
    if (this.notFound === undefined) {
      return null;
    }
    return {
      route: this.notFound,
      chain: this.notFound.chain,
      params: {},
      query,
      path,
      url: formatUrl(path, query)
    };
  }

  /** Guards run outermost first: a layout refuses before its children. */
  private runGuards(match: RouteMatch): boolean | RouteTarget {
    for (const route of match.chain) {
      if (route.guard === undefined) {
        continue;
      }
      const verdict = route.guard({ params: match.params as never, query: match.query, url: match.url });
      if (verdict !== true) {
        return verdict;
      }
    }
    return true;
  }
}

/**
 * Separates the params from the options, whichever shape the rest
 * tuple arrived in.
 */
function splitGoArgs(args: readonly unknown[]): [Readonly<Record<string, string>>, NavigateOptions] {
  const first = args[0];
  if (first === undefined) {
    return [{}, {}];
  }
  if (isNavigateOptions(first)) {
    return [{}, first];
  }
  return [first as Readonly<Record<string, string>>, (args[1] as NavigateOptions | undefined) ?? {}];
}

/**
 * A params-less route's only argument is its options, and the two are
 * both plain objects at runtime, so they are told apart by their keys.
 * An empty object is either, and behaves the same as either.
 */
function isNavigateOptions(value: unknown): value is NavigateOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.keys(value).every(key => key === 'query' || key === 'replace');
}

function urlOf(target: RouteTarget): string {
  return formatUrl(buildPath(target.route.path, target.params), target.query);
}

function normalize(url: string): string {
  const { path, query } = parseUrl(url);
  return formatUrl(path, query);
}

/**
 * Params compared by value, so a navigation that lands on the same
 * route with the same params emits nothing.
 *
 * Typed as `object` because `RouteParams<Path>` is a mapped type and
 * not assignable to `Record<string, string>`; the values are strings
 * either way, since that is all a url segment can hold.
 */
function sameParams(a: object | null, b: object | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  const left = a as Record<string, string>;
  const right = b as Record<string, string>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
}

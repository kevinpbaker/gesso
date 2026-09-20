import type { Observable } from 'rxjs';

import { computed, type ComputedCell } from '../computed';
import { internalState, type InternalState } from '../InternalState';
import type { RouteDefinition, RouteTarget } from './RouteDefinition';
import { RouteState } from './RouteState';
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
 * How a route's question and a shared slot's answer are compared, for
 * `answerFor`.
 *
 * Both sides return a string because both sides are naming the same
 * thing in the application's own words, and a string is the only shape
 * the router can compare without knowing what the thing is. Whatever
 * normalising the comparison needs (a case, a trailing slash) is done
 * in these two functions, where the application knows which it wants.
 */
export interface RouteAnswer<Path extends string, T> {
  /** What this route's params are asking for. */
  readonly asks: (params: RouteParams<Path>) => string;
  /** What a value from the slot is an answer about. */
  readonly answers: (value: NonNullable<T>) => string;
}

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
 * Named `RouterService` rather than `RouterStore`
 * because the store/service split of the thread model renamed all six
 * of its siblings; a `Store` here would be the only one left.
 */
export class RouterService {
  /** The current url, path and query. */
  readonly url = internalState('/');
  /** What that url resolved to, or null when nothing matched. */
  readonly match = internalState<RouteMatch | null>(null);
  /**
   * What each route remembers between the times its screen exists.
   *
   * Reached through `remember` and `forget`; exposed because a test and
   * a devtools panel both want to look at it whole.
   */
  readonly state = new RouteState();

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

  /** The same, as a cell, for binding a screen's title or fields. */
  observeParams<Path extends string>(route: RouteDefinition<Path>): ComputedCell<RouteParams<Path> | null> {
    return computed(() => this.params(route), { equal: sameParams, label: 'RouterService.params' });
  }

  /**
   * A cell a route keeps while its screen does not exist: a scroll
   * offset, a keyboard cursor, the text in a filter field.
   *
   * A screen is built when its route matches and destroyed when it
   * stops matching, so a list rebuilt after Back starts at the top
   * unless somebody remembered where it was. This is where that is
   * kept, and it is why Back returns to the row a person left rather
   * than to the top of the list.
   *
   *   const scroll = router.remember(Home, 'scroll', 0);
   *   <scrollview scrollY={scroll} modifiers={[scrollPosition({ … })]}>
   *
   * `initial` is used the first time the key is asked for and ignored
   * afterwards. The cell is scoped to the route, so two screens may
   * both call their offset `scroll`.
   *
   * A `null` route is the router's own scope, for the handful of values
   * that belong to the *navigation* rather than to one screen: which
   * element the next transition should morph from is the case both
   * applications have, since the screen that was pressed is destroyed
   * before the screen that arrives is built.
   *
   * This is a facility, not an architecture. The thread model leaves an
   * application's data to the application, and that has not changed:
   * what belongs here is the screen-shaped remainder that exists only
   * to put a screen back where it was. Anything that must survive a
   * reload, or that another part of the application acts on, is still
   * state on a channel.
   */
  remember<T>(route: RouteDefinition | null, key: string, initial: T): InternalState<T> {
    return this.state.cell(route, key, initial);
  }

  /** Drops what a route remembered, so its next screen starts fresh. */
  forget(route: RouteDefinition | null): void {
    this.state.forget(route);
  }

  /**
   * A shared slot's value, but only while it is the answer to *this*
   * route's own parameters.
   *
   * The case it exists for is a page loaded across the barrier. A
   * channel key that holds "the track page" holds whichever track was
   * asked for last, and a screen arriving during a transition asks for
   * its own and is handed the previous one until the answer lands. That
   * is one or two frames of the wrong cover, and it is worse than it
   * looks: the artwork element mounts carrying the previous track's
   * shared name, claims it, and never claims its own, so a second trip
   * between two pages does not animate at all.
   *
   *   const track = router.answerFor(Track, page.view.track, {
   *     asks: params => `/${params.handle}/${params.slug}`.toLowerCase(),
   *     answers: entry => entry.path.toLowerCase()
   *   });
   *
   * Two things about it are the router's to know rather than the
   * screen's. It follows the *current* params, so a navigation from one
   * track to another, which keeps the same screen mounted because the
   * chain did not change, asks the new question rather than staying on
   * the one the body read once. And when the route stops matching the
   * cell **keeps what it last held** instead of emptying: a screen is
   * still on screen while it leaves, and a departing page whose artwork
   * blanks for the last frames of its own fade is the flicker this is
   * meant to remove, not a new one to add.
   */
  answerFor<Path extends string, T>(
    route: RouteDefinition<Path>,
    source: Observable<T>,
    keys: RouteAnswer<Path, T>
  ): ComputedCell<T | null> {
    let held: T | null = null;
    return computed(
      read => {
        const params = this.params(route);
        if (params === null) {
          // Not showing: either this screen is on its way out, in which
          // case it keeps its own page, or it was never in.
          return held;
        }
        const value = read(source);
        held =
          value === null || value === undefined
            ? null
            : keys.answers(value as NonNullable<T>) === keys.asks(params)
              ? value
              : null;
        return held;
      },
      { label: `RouterService.answerFor(${route.path})` }
    );
  }

  /**
   * Whether a route is in the current chain — true for a layout while
   * any of its children shows, which is what a nav item highlights on.
   */
  isActive(route: RouteDefinition): ComputedCell<boolean> {
    return computed(() => {
      const match = this.match.value;
      return match !== null && match.chain.includes(route);
    });
  }

  /**
   * Resolves a url, runs the guards along the way, and publishes the
   * result.
   *
   * One method for both directions of travel, because a guard runs the
   * same either way — but what a redirect does to the history depends
   * on which direction it came from, and that is the whole of the
   * `replace` bookkeeping below.
   */
  private resolveInto(url: string, options: { push: boolean; replace?: boolean }): void {
    const push = options.push;
    let replace = options.replace ?? false;
    let target = url;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const match = this.resolve(target);
      const verdict = match === null ? true : this.runGuards(match);
      if (verdict === false) {
        // Refused with nowhere else to go: the current url stands. When
        // the refusal was of a url the shell already committed to, the
        // shell is put back where the app actually is.
        if (!push) {
          this.history?.replace(this.url.value);
        }
        return;
      }
      if (verdict === true) {
        this.publish(target, match, { push, replace });
        return;
      }
      target = urlOf(verdict);
      // Where a redirect leaves the history depends on whether the
      // refused url was ever an entry.
      //
      // From inside the app it was not: nothing is written until a
      // navigation settles, so the redirect pushes, and Back returns to
      // the screen the person left. Replacing here was a bug — it
      // overwrote the entry they were standing on, and Back walked out
      // of the app entirely.
      //
      // From the shell it was: the address bar already committed to the
      // refused url before the guard ever saw it, so the redirect
      // replaces, and Back does not land back on a url that will only
      // be refused again.
      replace = push ? replace : true;
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

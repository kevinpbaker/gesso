import type { UiChild } from 'gesso-core';
import type { ComponentType } from '../FunctionComponent';
import { parsePattern, type HasNoParams, type PatternSegment, type RouteParams } from './RoutePath';

/**
 * The prop a screen receives when other routes nest inside it.
 *
 * A route that is another route's `parent` renders that child through
 * this prop: it is the outlet, and the screen places it wherever it
 * belongs — beside a sidebar, inside a card, under a header. A screen
 * nobody nests inside never receives one.
 *
 *   function MailLayout(inputs: Inputs<OutletProps>) {
 *     return Row(Sidebar(), Box({ flexGrow: 1 }, inputs.outlet));
 *   }
 *
 * It is an `Inputs` cell like any other prop, so binding it as a child
 * is what makes the leaf swap without the layout being rebuilt.
 *
 * Never optional, so that placing it needs no ceremony: when no child
 * route is showing — `/mail` with nothing selected — the router feeds
 * the cell an empty list, and the outlet renders nothing.
 */
export interface OutletProps {
  readonly outlet: UiChild;
}

/** Where a navigation is going: a route and the params that fill it. */
export interface RouteTarget {
  readonly route: RouteDefinition;
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
}

/** What a guard is told about the navigation it is being asked to allow. */
export interface RouteContext<Path extends string = string> {
  readonly params: RouteParams<Path>;
  readonly query: Readonly<Record<string, string>>;
  /** The whole url being navigated to, path and query. */
  readonly url: string;
}

/**
 * A guard: an action that runs before its route is shown.
 *
 * Returning `true` lets the navigation through, `false` cancels it and
 * leaves the current url alone, and a `RouteTarget` — built with
 * `to(route, params)` — redirects. Guards are synchronous by design.
 * An asynchronous guard has to leave the app somewhere while it waits,
 * and "somewhere" is a screen, which means the waiting belongs to a
 * route rather than to the router: navigate to a loading route and
 * navigate on from it.
 */
export type RouteGuard<Path extends string = string> = (context: RouteContext<Path>) => boolean | RouteTarget;

/**
 * One route: a full path, the screen that renders it, and optionally a
 * parent it nests inside.
 *
 * Paths are full, not relative. A relative fragment would know only
 * its own segments, and the params a screen actually receives are its
 * parents' as well — so `RouteParams` could not be honest about them.
 * Nesting is declared by pointing at the parent route object instead
 * of by position, which also means there are no route ids to keep
 * unique and no string to misspell.
 */
export interface RouteDefinition<Path extends string = string> {
  readonly path: Path;
  readonly component: ComponentType;
  readonly parent?: RouteDefinition;
  readonly guard?: RouteGuard<Path>;
  /** Parsed once, here, so matching a url never parses a pattern. */
  readonly segments: readonly PatternSegment[];
  /** Every ancestor and then this route: the chain the outlets render. */
  readonly chain: readonly RouteDefinition[];
}

export interface RouteOptions<Path extends string> {
  readonly path: Path;
  readonly component: ComponentType;
  /** The route this one renders inside; its screen receives an `outlet`. */
  readonly parent?: RouteDefinition;
  readonly guard?: RouteGuard<Path>;
}

/**
 * Declares a route.
 *
 * The path is inferred as a literal type, which is where typed params
 * come from: `route({ path: '/mail/:id', ... })` produces a
 * `RouteDefinition<'/mail/:id'>`, and everything downstream — the
 * guard's context, `router.go`, `router.params` — reads `{ id: string }`
 * off it.
 */
export function route<const Path extends string>(options: RouteOptions<Path>): RouteDefinition<Path> {
  const parent = options.parent;
  const segments = parsePattern(options.path);
  if (parent !== undefined && !extendsParent(parent.segments, segments)) {
    throw new Error(
      `Route '${options.path}' declares '${parent.path}' as its parent but does not extend it. ` +
        "A nested route renders inside its parent, so its path must begin with the parent's segments."
    );
  }
  const chain: RouteDefinition[] = parent === undefined ? [] : [...parent.chain];
  const definition: RouteDefinition<Path> = {
    path: options.path,
    component: options.component,
    parent,
    guard: options.guard,
    segments,
    chain
  };
  chain.push(definition);
  return definition;
}

/**
 * A navigation target: this route, with these params.
 *
 * The params argument is typed from the route's path, so a redirect to
 * a route that needs an id cannot forget it. A route with no params
 * takes no second argument.
 */
export function to<Path extends string>(route: RouteDefinition<Path>, ...args: ToArgs<Path>): RouteTarget {
  const [params, options] = args as unknown as [Readonly<Record<string, string>>?, ToOptions?];
  return {
    route,
    params: params ?? {},
    query: options?.query ?? {}
  };
}

interface ToOptions {
  readonly query?: Readonly<Record<string, string>>;
}

/**
 * What `to` takes after the route, on the same reasoning as `GoArgs`:
 * a route with no params must not silently accept some.
 */
type ToArgs<Path extends string> =
  HasNoParams<Path> extends true ? [] : [params: RouteParams<Path>, options?: ToOptions];

/**
 * Whether `child` begins with `parent`, segment by segment.
 *
 * Segment-wise rather than by string prefix, so `/mailbox` is not
 * mistaken for a child of `/mail`.
 */
function extendsParent(parent: readonly PatternSegment[], child: readonly PatternSegment[]): boolean {
  if (child.length < parent.length) {
    return false;
  }
  return parent.every((segment, index) => {
    const other = child[index]!;
    if (segment.kind !== other.kind) {
      return false;
    }
    if (segment.kind === 'static' && other.kind === 'static') {
      return segment.text === other.text;
    }
    if (segment.kind === 'param' && other.kind === 'param') {
      return segment.name === other.name;
    }
    return true;
  });
}

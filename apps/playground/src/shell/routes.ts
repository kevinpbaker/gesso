/**
 * The single source of truth for what routes exist.
 *
 * Before this list the nav was written out by hand in four separate
 * HTML templates, which is why each route used to show a different
 * subset of the others and why some routes were reachable only by
 * typing the hash. The shell renders the nav from this array and the
 * router resolves hashes against it, so a route added here appears
 * everywhere at once.
 *
 * Deliberately free of any import from the route modules: the shell
 * imports this to draw the nav, and the router (main.ts) is the only
 * place that maps an id to its mount function. Keeping the mount
 * functions out avoids a cycle and keeps every route lazily
 * importable.
 */
export interface RouteMeta {
  /** Location hash, without the '#'. */
  readonly id: string;
  /** Short label used in the nav. */
  readonly label: string;
  /** Full title shown in the header of the route itself. */
  readonly title: string;
  /**
   * The nav item this route belongs under, for pages reached from
   * another route rather than from the nav. A route with a parent is
   * not listed in the nav; its parent is marked current while it is
   * mounted.
   */
  readonly parent?: string;
  /**
   * Reachable only by typing its hash: absent from the nav, and
   * pointed at by nothing else.
   *
   * Different from `parent`, which describes a page reached from
   * another page and still highlights the nav item it belongs to.
   * A hidden route belongs under nothing. It exists for a view that
   * would confuse a visitor to be offered — `transitions-app` renders
   * the same example as `example-transitions`, so listing both would
   * pose a question the nav cannot answer — while staying a real
   * route the router resolves, rather than a branch on a query
   * parameter or a build flag.
   */
  readonly hidden?: boolean;
}

export const ROUTES: readonly RouteMeta[] = [
  { id: 'debug', label: 'Layout', title: 'Layout inspector · DOM boxes' },
  { id: 'canvas', label: 'Canvas', title: 'Canvas2D renderer · three threads' },
  { id: 'framework', label: 'Framework', title: 'Component runtime · render worker' },
  { id: 'framework-sync', label: 'Single thread', title: 'Component runtime · main thread' },
  { id: 'webgpu', label: 'WebGPU', title: 'WebGPU renderer' },
  { id: 'compare', label: 'Compare', title: 'Canvas2D and WebGPU, side by side' },
  { id: 'benchmark', label: 'Benchmark', title: 'WebGPU renderer benchmark' },
  { id: 'examples', label: 'Examples', title: 'Examples · small complete apps' },
  { id: 'example-signin', label: 'Sign in', title: 'Example · passcode sign-in, written in JSX', parent: 'examples' },
  { id: 'example-notes', label: 'Notes', title: 'Example · notes with text editing and IME', parent: 'examples' },
  { id: 'example-theme', label: 'Theming', title: 'Example · theming through the environment', parent: 'examples' },
  {
    id: 'example-live',
    label: 'Live',
    title: 'Example · a live feed bound straight to the canvas',
    parent: 'examples'
  },
  {
    id: 'example-router',
    label: 'Routing',
    title: 'Example · nested routes, guards, and the browser’s Back button',
    parent: 'examples'
  },
  {
    id: 'example-animation',
    label: 'Animation',
    title: 'Example · a board that moves, and an idle app that does not',
    parent: 'examples'
  },
  {
    id: 'example-transitions',
    label: 'Transitions',
    title: 'Example · shared elements across a route change, and a video that keeps playing',
    parent: 'examples'
  },
  {
    id: 'transitions-app',
    label: 'Transitions (standalone)',
    title: 'Transitions, with no playground around it',
    hidden: true
  }
];

export const DEFAULT_ROUTE_ID = 'debug';

/**
 * The route a location hash names, ignoring anything after it.
 *
 * A route may own the rest of the fragment: the routing example runs a
 * Gesso app whose own url lives at `#example-router/mail/inbox/2`, so
 * the id is the first segment and the remainder belongs to the page.
 * Splitting here is what lets the shell leave a mounted route alone
 * while the app inside it navigates.
 */
export function routeIdFromHash(hash: string): string {
  return hash.replace(/^#/, '').split('/')[0] ?? '';
}

export function findRoute(id: string): RouteMeta | undefined {
  return ROUTES.find(route => route.id === id);
}

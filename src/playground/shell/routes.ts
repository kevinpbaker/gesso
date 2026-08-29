/**
 * The single source of truth for what routes exist.
 *
 * Before this list the nav was written out by hand in four separate
 * HTML templates, which is why each route used to show a different
 * subset of the others and why `#theme` was reachable only by typing
 * the hash. The shell renders the nav from this array and the router
 * resolves hashes against it, so a route added here appears
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
}

export const ROUTES: readonly RouteMeta[] = [
  { id: 'debug', label: 'Layout', title: 'Layout inspector · DOM boxes' },
  { id: 'canvas', label: 'Canvas', title: 'Canvas2D renderer · three threads' },
  { id: 'framework', label: 'Framework', title: 'Component runtime · render worker' },
  { id: 'framework-sync', label: 'Single thread', title: 'Component runtime · main thread' },
  { id: 'webgpu', label: 'WebGPU', title: 'WebGPU renderer' },
  { id: 'compare', label: 'Compare', title: 'Canvas2D and WebGPU, side by side' },
  { id: 'benchmark', label: 'Benchmark', title: 'WebGPU renderer benchmark' },
  { id: 'binding', label: 'Bindings', title: 'Reactive bindings to the canvas' },
  { id: 'theme', label: 'Theme', title: 'Theme and environment propagation' }
];

export const DEFAULT_ROUTE_ID = 'debug';

export function findRoute(id: string): RouteMeta | undefined {
  return ROUTES.find(route => route.id === id);
}

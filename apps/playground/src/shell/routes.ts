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
  /**
   * Views of one page, chosen by a switch in the header and addressed
   * by the hash segment after the route's id: `#renderers/compare`.
   * The first is what the bare `#renderers` shows.
   *
   * For a page that is one subject seen several ways — the same scene
   * through each renderer, the same app on each thread — where a nav
   * item per way made the nav a list of near-duplicates. Each mode is
   * still a link of its own, and still a screenshot of its own.
   */
  readonly modes?: readonly RouteMode[];
  /** What the mode switch is called, for assistive technology. */
  readonly modesLabel?: string;
}

/** One view of a route with `modes`. */
export interface RouteMode {
  /** The hash segment after the route's id. */
  readonly id: string;
  /** Short label used in the mode switch. */
  readonly label: string;
  /** Full title shown in the header while this mode is mounted. */
  readonly title: string;
}

export const ROUTES: readonly RouteMeta[] = [
  { id: 'workbench', label: 'Workbench', title: 'Component workbench · every component in its states' },
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
    id: 'example-paint',
    label: 'Painting',
    title: 'Example · a paint hook and vector paths, on both renderers',
    parent: 'examples'
  },
  {
    id: 'example-input',
    label: 'Gestures',
    title: 'Example · drop targets, a pinch, shortcuts and a context menu',
    parent: 'examples'
  },
  {
    id: 'example-layout',
    label: 'Layout',
    title: 'Example · a custom layout, container queries and insets',
    parent: 'examples'
  },
  {
    id: 'example-video',
    label: 'Video',
    title: 'Example · every way a clip arrives, decoded in the render worker',
    parent: 'examples'
  },
  {
    id: 'example-transitions',
    label: 'Transitions',
    title: 'Example · shared elements across a route change, and a video that keeps playing',
    parent: 'examples'
  },
  {
    id: 'framework',
    label: 'Threads',
    title: 'Example · one app, on a render worker or on the main thread',
    parent: 'examples',
    modesLabel: 'Thread',
    modes: [
      { id: 'worker', label: 'Render worker', title: 'Component runtime · render worker' },
      { id: 'main-thread', label: 'Main thread', title: 'Component runtime · main thread' }
    ]
  },
  {
    id: 'example-modifiers',
    label: 'Modifiers',
    title: 'Example · modifiers, behaviour attached to an element',
    parent: 'examples'
  },
  {
    id: 'renderers',
    label: 'Renderers',
    title: 'Renderers · one layout scene, every way it is drawn',
    modesLabel: 'Renderer',
    modes: [
      { id: 'dom', label: 'DOM boxes', title: 'Layout inspector · DOM boxes' },
      { id: 'canvas', label: 'Canvas2D', title: 'Canvas2D renderer · three threads' },
      { id: 'webgpu', label: 'WebGPU', title: 'WebGPU renderer' },
      { id: 'compare', label: 'Side by side', title: 'Canvas2D and WebGPU, side by side' }
    ]
  },
  // A tool to run rather than a page to browse: it drives a continuous
  // load, and its numbers mean something only to someone who came
  // looking for them.
  { id: 'benchmark', label: 'Benchmark', title: 'WebGPU renderer benchmark', hidden: true },
  {
    id: 'transitions-app',
    label: 'Transitions (standalone)',
    title: 'Transitions, with no playground around it',
    hidden: true
  }
];

/**
 * Hashes that used to be routes, and the view each now lives at.
 *
 * Kept so a link written before the nav was cut down — in the README,
 * the docs, a bookmark, a script — still lands on what it pointed at.
 * The router rewrites the hash in place rather than pushing an entry,
 * so Back does not return to the old address only to redirect again.
 */
export const REDIRECTS: Readonly<Record<string, string>> = {
  debug: 'renderers/dom',
  canvas: 'renderers/canvas',
  webgpu: 'renderers/webgpu',
  compare: 'renderers/compare',
  'framework-sync': 'framework/main-thread',
  modifiers: 'example-modifiers'
};

export const DEFAULT_ROUTE_ID = 'renderers';

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

/**
 * What is on screen: a route and, for a route with modes, which one.
 *
 * `id` is the route's id, or `route/mode` for a route with modes. It is
 * what the router compares to decide whether to remount, what a route
 * hands the shell, and what a screenshot baseline is named after.
 */
export interface RouteView {
  readonly id: string;
  readonly route: RouteMeta;
  readonly mode?: RouteMode;
  /** The mode's title where there is one, else the route's. */
  readonly title: string;
}

/**
 * The view a hash or a view id names, or `undefined` for one that
 * names no route.
 *
 * A route with modes reads one segment more than `routeIdFromHash`
 * does, and a missing or unknown mode means its first, so `#renderers`
 * and `#renderers/nonsense` both show the DOM boxes. Redirects are not
 * followed here; that is `redirectFor`.
 */
export function findView(hash: string): RouteView | undefined {
  const [routeId = '', modeId] = hash.replace(/^#/, '').split('/');
  const route = findRoute(routeId);
  if (route === undefined) {
    return undefined;
  }
  const modes = route.modes ?? [];
  if (modes.length === 0) {
    return { id: route.id, route, title: route.title };
  }
  const mode = modes.find(candidate => candidate.id === modeId) ?? modes[0];
  return { id: `${route.id}/${mode.id}`, route, mode, title: mode.title };
}

/** Every view there is: one per route, or one per mode of a route that has them. */
export function allViews(): RouteView[] {
  return ROUTES.flatMap(route =>
    (route.modes ?? [undefined]).map(mode => findView(mode === undefined ? route.id : `${route.id}/${mode.id}`)!)
  );
}

/** The hash an old address should be replaced with, or `undefined` for a current one. */
export function redirectFor(hash: string): string | undefined {
  const target = REDIRECTS[routeIdFromHash(hash)];
  return target === undefined ? undefined : `#${target}`;
}

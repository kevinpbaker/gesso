import './playground/shell/theme.css';

import { mountAnimationExampleRoute } from './playground/routes/AnimationExampleRoute';
import { mountBenchmarkRoute } from './playground/routes/BenchmarkRoute';
import { mountCanvasRoute } from './playground/routes/CanvasRoute';
import { mountCompareRoute } from './playground/routes/CompareRoute';
import { mountExamplesRoute } from './playground/routes/ExamplesRoute';
import { mountFrameworkRoute, mountFrameworkSyncRoute } from './playground/routes/FrameworkRoute';
import { mountSignInExampleRoute } from './playground/routes/SignInExampleRoute';
import { mountNotesExampleRoute } from './playground/routes/NotesExampleRoute';
import { mountLayoutRoute } from './playground/routes/LayoutRoute';
import { mountLiveExampleRoute } from './playground/routes/LiveExampleRoute';
import { mountRouterExampleRoute } from './playground/routes/RouterExampleRoute';
import { mountThemeExampleRoute } from './playground/routes/ThemeExampleRoute';
import { mountWebGPURoute } from './playground/routes/WebGPURoute';
import { DEFAULT_ROUTE_ID, findRoute, routeIdFromHash, ROUTES } from './playground/shell/routes';

/** Mounts a route into `host` and returns its teardown. */
type Mount = (host: HTMLElement) => () => void;

/**
 * Maps each declared route to its implementation.
 *
 * The route list itself lives in shell/routes so the nav can be
 * rendered without importing any of these modules. This is the one
 * place the two halves meet, and the check below keeps them honest:
 * a route added to the list but never wired up used to fail silently,
 * by quietly falling back to the layout route.
 */
const MOUNTS: Record<string, Mount> = {
  debug: mountLayoutRoute,
  canvas: mountCanvasRoute,
  framework: mountFrameworkRoute,
  'framework-sync': mountFrameworkSyncRoute,
  webgpu: mountWebGPURoute,
  compare: mountCompareRoute,
  benchmark: mountBenchmarkRoute,
  examples: mountExamplesRoute,
  'example-signin': mountSignInExampleRoute,
  'example-notes': mountNotesExampleRoute,
  'example-theme': mountThemeExampleRoute,
  'example-live': mountLiveExampleRoute,
  'example-router': mountRouterExampleRoute,
  'example-animation': mountAnimationExampleRoute
};

if (import.meta.env.DEV) {
  const missing = ROUTES.filter(route => MOUNTS[route.id] === undefined).map(route => route.id);
  if (missing.length > 0) {
    throw new Error(`Routes declared with no mount function: ${missing.join(', ')}.`);
  }
}

let unmount: (() => void) | null = null;
/** Which route is on screen, so a hash change below it is ignored. */
let mountedId: string | null = null;

function mountRoute(): void {
  const host = document.querySelector<HTMLElement>('#app');
  if (host === null) {
    throw new Error("Missing '#app' element.");
  }

  // The first segment only. A route may own the rest of the fragment —
  // the routing example runs a Gesso app whose own url lives there —
  // and remounting the page on every one of its navigations would
  // destroy the app the person is navigating.
  const requested = routeIdFromHash(window.location.hash);
  const id = findRoute(requested) === undefined ? DEFAULT_ROUTE_ID : requested;
  if (id === mountedId) {
    return;
  }

  unmount?.();
  // Cleared before the next mount so that a route which throws
  // part-way through cannot leave the previous route's teardown in
  // place, to be run a second time on the next navigation.
  unmount = null;
  mountedId = id;
  unmount = MOUNTS[id](host);
}

window.addEventListener('hashchange', mountRoute);
mountRoute();

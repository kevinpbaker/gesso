import './playground/shell/theme.css';

import { mountBenchmarkRoute } from './playground/routes/BenchmarkRoute';
import { mountBindingRoute } from './playground/routes/BindingRoute';
import { mountCanvasRoute } from './playground/routes/CanvasRoute';
import { mountCompareRoute } from './playground/routes/CompareRoute';
import { mountExamplesRoute } from './playground/routes/ExamplesRoute';
import { mountFrameworkRoute, mountFrameworkSyncRoute } from './playground/routes/FrameworkRoute';
import { mountSignInExampleRoute } from './playground/routes/SignInExampleRoute';
import { mountNotesExampleRoute } from './playground/routes/NotesExampleRoute';
import { mountLayoutRoute } from './playground/routes/LayoutRoute';
import { mountThemeRoute } from './playground/routes/ThemeRoute';
import { mountWebGPURoute } from './playground/routes/WebGPURoute';
import { DEFAULT_ROUTE_ID, findRoute, ROUTES } from './playground/shell/routes';

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
  binding: mountBindingRoute,
  theme: mountThemeRoute,
  examples: mountExamplesRoute,
  'example-signin': mountSignInExampleRoute,
  'example-notes': mountNotesExampleRoute
};

if (import.meta.env.DEV) {
  const missing = ROUTES.filter(route => MOUNTS[route.id] === undefined).map(route => route.id);
  if (missing.length > 0) {
    throw new Error(`Routes declared with no mount function: ${missing.join(', ')}.`);
  }
}

let unmount: (() => void) | null = null;

function mountRoute(): void {
  const host = document.querySelector<HTMLElement>('#app');
  if (host === null) {
    throw new Error("Missing '#app' element.");
  }

  const requested = window.location.hash.replace('#', '');
  const id = findRoute(requested) === undefined ? DEFAULT_ROUTE_ID : requested;

  unmount?.();
  // Cleared before the next mount so that a route which throws
  // part-way through cannot leave the previous route's teardown in
  // place, to be run a second time on the next navigation.
  unmount = null;
  unmount = MOUNTS[id](host);
}

window.addEventListener('hashchange', mountRoute);
mountRoute();

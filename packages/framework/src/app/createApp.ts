import type { FrameworkChild } from '../ComponentElement';
import type { ComponentType } from '../FunctionComponent';
import { GessoAppBuilder } from './GessoAppBuilder';
import { WorkerApp, type WorkerAppOptions } from './worker/WorkerApp';

/**
 * What a shell passes when `gesso-vite-plugin` supplies the workers.
 *
 * The only difference from `WorkerAppOptions` is that `renderWorker` is
 * optional, because the plugin writes it: it rewrites `createApp(...)`
 * so that its own factories are merged under whatever the author wrote,
 * and the literal `new Worker(new URL(...))` it emits is the same
 * expression an author would have written by hand. Writing it by hand
 * is still supported and still documented; what the
 * plugin removes is the obligation to.
 *
 * Without the plugin and without a `renderWorker`, this throws with the
 * two ways to fix it, rather than mounting an application that would
 * quietly never draw.
 */
export interface CreateAppOptions extends Omit<WorkerAppOptions, 'renderWorker'> {
  /** Spawns the render worker. Written by the plugin when it is absent. */
  renderWorker?: WorkerAppOptions['renderWorker'];
  /**
   * The `name` to give every worker the plugin constructs, which is
   * how a worker reads a flag that only the page's url carries: the
   * playground's `?still` and Segue's are the same trick.
   *
   * Ignored when `renderWorker` is written by hand, since the factory
   * then names the worker itself.
   */
  workerName?: string;
}

/**
 * Creates a Gesso application.
 *
 * Two configurations, because a class reference cannot cross
 * postMessage: the root component has to already be inside the worker
 * that renders it.
 *
 * Worker-hosted (the default for an interactive app) — all UI work
 * happens off the main thread. With `gesso-vite-plugin` in the Vite
 * config, the shell names no worker at all:
 *
 *   // main.ts
 *   createApp({ history: { mode: 'path' } }).mount('#app');
 *
 *   // app.render.worker.ts
 *   renderRoot(AppRoot).useChannel(Catalog);
 *
 * and without it, the same thing said out loud:
 *
 *   createApp({
 *     renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' }),
 *     appLogicWorker: () => new Worker(new URL('./app.logic.worker.ts', import.meta.url), { type: 'module' })
 *   }).mount('#app');
 *
 * Single-thread — for tests, headless rendering, and environments
 * without OffscreenCanvas:
 *
 *   createApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
 */
export function createApp(options?: CreateAppOptions): WorkerApp;
export function createApp(root: FrameworkChild | ComponentType): GessoAppBuilder;
export function createApp(arg?: CreateAppOptions | FrameworkChild | ComponentType): WorkerApp | GessoAppBuilder {
  if (isWorkerAppOptions(arg)) {
    if (arg?.renderWorker === undefined) {
      throw new Error(
        'createApp() was given no render worker. Add `gesso()` from gesso-vite-plugin to the Vite config, which ' +
          "writes the construction, or pass one: renderWorker: () => new Worker(new URL('./worker.ts', " +
          "import.meta.url), { type: 'module' })."
      );
    }
    return new WorkerApp(arg as WorkerAppOptions);
  }
  return new GessoAppBuilder(arg);
}

/**
 * Whether the argument describes the worker configuration.
 *
 * It used to be the presence of `renderWorker`, which no longer
 * distinguishes anything: the plugin's whole point is that the option
 * is absent. So the test is the other way round — anything that is
 * recognisably a child is one, and everything else is options. A
 * `UiElement` carries `type`, a `ComponentElement` carries `kind`, an
 * observable child carries `subscribe`, and a component is a function;
 * `WorkerAppOptions` has none of those and never will, because each is
 * the identity of something that goes in a tree.
 */
function isWorkerAppOptions(value: unknown): value is CreateAppOptions | undefined {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return !('type' in value) && !('kind' in value) && !('subscribe' in value);
}

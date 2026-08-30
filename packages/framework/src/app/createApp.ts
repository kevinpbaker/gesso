import type { FrameworkChild } from '../ComponentElement';
import type { ComponentType } from '../FunctionComponent';
import { GessoAppBuilder } from './GessoAppBuilder';
import { WorkerApp, type WorkerAppOptions } from './worker/WorkerApp';

/**
 * Creates a Gesso application.
 *
 * Two configurations, because a class reference cannot cross
 * postMessage: the root component has to already be inside the worker
 * that renders it.
 *
 * Worker-hosted (the default for an interactive app) — all UI work
 * happens off the main thread:
 *
 *   // main.ts
 *   createApp({
 *     renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' }),
 *     appLogicWorker: () => new Worker(new URL('./app.logic.worker.ts', import.meta.url), { type: 'module' })
 *   }).mount('#app');
 *
 *   // app.render.worker.ts
 *   renderRoot(AppRoot).useChannel(Catalog);
 *
 * Single-thread — for tests, headless rendering, and environments
 * without OffscreenCanvas:
 *
 *   createApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
 */
export function createApp(options: WorkerAppOptions): WorkerApp;
export function createApp(root: FrameworkChild | ComponentType): GessoAppBuilder;
export function createApp(arg: WorkerAppOptions | FrameworkChild | ComponentType): WorkerApp | GessoAppBuilder {
  if (isWorkerAppOptions(arg)) {
    return new WorkerApp(arg);
  }
  return new GessoAppBuilder(arg);
}

function isWorkerAppOptions(value: unknown): value is WorkerAppOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const worker = (value as Partial<WorkerAppOptions>).renderWorker;
  return typeof worker === 'function' || typeof worker === 'string' || worker instanceof URL;
}

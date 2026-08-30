import type { FrameworkChild } from '../ComponentElement';
import type { ComponentType } from '../FunctionComponent';
import { NodalAppBuilder } from './NodalAppBuilder';
import { WorkerApp, type WorkerAppOptions } from './worker/WorkerApp';

/**
 * Creates a Nodal application.
 *
 * Two configurations, because a class reference cannot cross
 * postMessage: the root component has to already be inside the worker
 * that renders it.
 *
 * Worker-hosted (the default for an interactive app) — all UI work
 * happens off the main thread:
 *
 *   // main.ts
 *   createApp({ worker: new URL('./app.worker.ts', import.meta.url) }).mount('#app');
 *
 *   // app.worker.ts
 *   renderRoot(AppRoot).useChannel(Catalog);
 *
 * Single-thread — for tests, headless rendering, and environments
 * without OffscreenCanvas:
 *
 *   createApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
 */
export function createApp(options: WorkerAppOptions): WorkerApp;
export function createApp(root: FrameworkChild | ComponentType): NodalAppBuilder;
export function createApp(arg: WorkerAppOptions | FrameworkChild | ComponentType): WorkerApp | NodalAppBuilder {
  if (isWorkerAppOptions(arg)) {
    return new WorkerApp(arg);
  }
  return new NodalAppBuilder(arg);
}

function isWorkerAppOptions(value: unknown): value is WorkerAppOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const worker = (value as Partial<WorkerAppOptions>).worker;
  return typeof worker === 'function' || typeof worker === 'string' || worker instanceof URL;
}

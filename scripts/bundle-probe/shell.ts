/**
 * The smallest honest shell: a worker application's whole main thread.
 *
 * Nothing is left out that a real one has — `mount` is what brings in
 * the canvas, the input surface, the editing proxy and the semantics
 * mirror — and nothing is added that would make the measurement
 * flattering.
 */
import { createApp } from 'gesso-framework';

createApp({
  renderWorker: () => new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' })
}).mount('#app');

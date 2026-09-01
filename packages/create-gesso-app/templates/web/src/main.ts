/**
 * The main thread's entire job.
 *
 * It finds a host element, creates the app with a way to start the
 * render worker, and mounts. Everything a person sees is built, laid
 * out, painted and hit-tested in the worker; the page forwards input
 * events and does nothing else, so work on this thread cannot delay a
 * frame.
 */
import { createApp } from '@gesso/framework';

const host = document.querySelector<HTMLElement>('#app');
if (host === null) {
  throw new Error('index.html has no #app element to mount into.');
}

const app = createApp({
  // Written out literally, and it has to be: a bundler emits a chunk
  // for a worker it can see constructed, and cannot see through a
  // variable holding the URL.
  renderWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
});

app.mount(host);

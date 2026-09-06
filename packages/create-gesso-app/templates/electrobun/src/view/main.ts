/**
 * The window's main thread, and its whole job.
 *
 * It builds the bridge to the main process, hands it to the shell as
 * the application layer, and mounts. Every patch goes from the main
 * process straight into the render worker as a body this thread
 * carries and never reads, which is what keeps a webview's main thread
 * a transport rather than a router.
 */
import type { GessoFrame } from '@gesso/electrobun';
import { createElectrobunBridge } from '@gesso/electrobun/view';
import { createApp } from '@gesso/framework';
import { Electroview } from 'electrobun/view';

import type { GessoWindowRPC } from '../shared/rpc';

const bridge = createElectrobunBridge({
  send: frame => view.rpc?.send.gessoFrame(frame),
  // The main process is the only side that knows, so the shell is told
  // rather than left to ask `matchMedia`, which lies in this webview.
  onColorScheme: scheme => shell.setColorScheme(scheme)
});

const rpc = Electroview.defineRPC<GessoWindowRPC>({
  maxRequestTime: 30_000,
  handlers: {
    requests: {},
    messages: { gessoFrame: (frame: GessoFrame) => bridge.receive(frame) }
  }
});
const view = new Electroview({ rpc });

const host = document.getElementById('app');
if (host === null) {
  throw new Error('index.html has no #app element to mount into.');
}

const shell = createApp({
  // Written out literally, and it has to be: a bundler emits a chunk
  // for a worker it can see constructed, and cannot see through a
  // variable holding the URL.
  renderWorker: () => new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' }),
  // The application layer is in another process, so this is the bridge
  // rather than a data worker. The render worker cannot tell.
  appLogicWorker: bridge.endpoint,
  // A window has no address bar, so its routes are its own.
  history: { mode: 'memory' },
  // A link in a desktop application belongs in the person's browser,
  // which only the process outside this window can reach.
  onOpenUrl: url => bridge.openUrl(url),
  onError: (message, stack, source) => console.error(`[gesso ${source}] ${message}`, stack)
});
shell.mount(host);

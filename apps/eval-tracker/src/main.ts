/** The main thread: create the app and mount it. `gesso-vite-plugin` writes the worker construction. */
import { createApp } from 'gesso-framework';

const host = document.querySelector<HTMLElement>('#app');
if (host === null) {
  throw new Error('index.html has no #app element to mount into.');
}

createApp({ pageKeys: true }).mount(host);

# Gesso Devtools for Chrome

A Gesso panel in Chrome's devtools: the node tree with the components that rendered each node, a selected node's report, the render and application workers' consoles in one log, the frame profiler, and the store action log.

The panel itself is `mountDevtoolsPanel` from `gesso-devtools`. This extension is the wiring that puts it in a devtools tab: a content script that reaches the page's devtools hook over `window.postMessage`, a background service worker that relays between the tab and the panels inspecting it, and a devtools page that adds the panel.

## Building

```sh
pnpm --filter gesso-devtools-extension build
```

The extension is written to `apps/devtools-extension/dist`.

## Loading it

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Choose **Load unpacked** and pick `apps/devtools-extension/dist`.
4. Reload any tab that was already open; a content script is not injected into pages loaded before the extension was.
5. Open devtools on a page running a Gesso application and pick the **Gesso** tab.

## What the page has to do

Call `connectDevtools(app)` from `gesso-devtools` once the application is created. Nothing is running in a page that has not, and the panel says so.

```ts
import { createApp } from 'gesso-framework';
import { connectDevtools } from 'gesso-devtools';

const app = createApp({ renderWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) });
app.mount(document.getElementById('app')!);
connectDevtools(app, { name: 'My app' });
```

The playground's framework routes do this, so any of them is a page to try it on.

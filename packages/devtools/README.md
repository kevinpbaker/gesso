# gesso-devtools

See what a Gesso application is doing, and what it threw.

```bash
npm install --save-dev gesso-devtools
```

## The error overlay

A canvas application that throws leaves its last good frame on screen, looking exactly like one that works. This draws the failure over it:

```ts
import { mountErrorOverlay } from 'gesso-devtools';

createApp({ onError: mountErrorOverlay(document.body) }).mount('#app');
```

`mountErrorOverlay(host)` returns a `report` matching `WorkerAppOptions.onError`, so wiring it is one line. It names which of five sources the failure came from and decodes the source maps of the scripts the stack names, so a frame points at the file somebody wrote rather than at a bundled line and column.

## The panels

- **Node inspector** -- the tree with owners, and a node's report: props with their sources, `listens`, `beneath`, and the layout explanation
- **Frame profiler** -- where a frame's milliseconds went, by phase
- **Action log** -- what crossed the barrier, with the cause that started it
- **Worker consoles** -- `console.*` from the render and application workers, with the thread named

`connectDevtools()` in your render worker is the one line that makes an application answer a panel. The same panel is hosted two ways: a Chrome devtools extension, and a pane inside the page.

## Documentation

[Devtools](https://gesso-docs.vercel.app/tooling/devtools) | [Errors and the overlay](https://gesso-docs.vercel.app/structure/errors-and-the-overlay) | [Frames and phases](https://gesso-docs.vercel.app/tooling/frames-and-phases)

MIT (c) Kevin Baker

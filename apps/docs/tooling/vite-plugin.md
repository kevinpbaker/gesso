---
description: One plugin that writes the worker construction, the hot-replacement wiring and the error overlay, and says when a save is about to reload the page.
---

# The Vite plugin

A Gesso application is three files either side of a thread barrier, and
until recently the barrier cost you four incantations in two of them:

```ts
// main.ts, before
const app = createApp({
  renderWorker: () => new Worker(new URL('./RenderWorker.ts', import.meta.url), { type: 'module' }),
  appLogicWorker: () => new Worker(new URL('./AppWorker.ts', import.meta.url), { type: 'module' })
});
```

```ts
// RenderWorker.ts, before
const app = renderRoot(AppRoot).useService(Feed);
import.meta.hot?.accept('./AppRoot', module => {
  app.reload(module.AppRoot, [module.Feed]);
});
```

Not one of those is a decision. Every application writes them the same
way, each of them fails silently when it is wrong, and the second pair
is written from scratch every time because there is nothing to copy from
except another application. `gesso-vite-plugin` writes all of them.

```ts
// vite.config.ts
import { gesso } from 'gesso-vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [gesso()]
});
```

```ts
// main.ts, after
createApp({ history: { mode: 'path' } }).mount('#app');
```

```ts
// RenderWorker.ts, after
renderRoot(AppRoot).useService(Feed);
```

The three-file shape is unchanged, and it is not going anywhere: a
component cannot cross a `postMessage`, so the root has to be named on
the worker's side of the barrier. What the plugin removes is the
ceremony around that fact.

## How it finds the entries

The shell is the module that calls `createApp` imported from
`gesso-framework`. Beside it, the plugin asks the bundler's own
resolver for the first of these that resolves:

| Entry              | Names tried, in order                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Render worker      | `RenderWorker.ts`, `RenderWorker.tsx`, `render.worker.ts`, `app.render.worker.ts`, `worker.ts` |
| Application worker | `AppWorker.ts`, `AppWorker.tsx`, `app.worker.ts`, `app.logic.worker.ts`                        |

The specific names beat the generic one, so an application with both
`RenderWorker.ts` and `worker.ts` gets the first, and the scaffold,
which has only `worker.ts`, still resolves. An application with no
application worker gets no `appLogicWorker`, which is the shape the
scaffold produces.

If your files are called something else, say so:

```ts
gesso({ renderWorker: './ui/paint.worker.ts', appLogicWorker: false });
```

The resolution goes through the bundler rather than the filesystem, so
your aliases and your extensions apply, and a name that would not have
resolved is an error at startup rather than a worker that never starts.

## What it writes

Into the shell module, on the same line as your call, so no line number
moves:

```ts
const app = createApp(__gessoOptions({ history: { mode: 'path' } }));
```

and below it a function that merges the factories **under** the options
you wrote:

```ts
function __gessoOptions(options = {}) {
  return {
    renderWorker: () =>
      new Worker(new URL('./RenderWorker.ts', import.meta.url), { type: 'module', name: options.workerName }),
    appLogicWorker: () =>
      new Worker(new URL('./AppWorker.ts', import.meta.url), { type: 'module', name: options.workerName }),
    onError: __gessoReportError,
    ...options
  };
}
```

Your spread comes last, so anything you wrote wins. Writing the
construction by hand is still supported and still correct; the plugin
sees a `renderWorker` in your options and leaves the construction alone.

`new Worker(new URL(...), { type: 'module' })` is written out literally
because that is the only form a bundler emits a chunk for. It cannot see
through a variable holding the URL, which is exactly why this text has
to be emitted into your module rather than living inside the framework.

`workerName` is passed through to both workers. It is how a worker
reads a flag that only the page's URL carries: Segue's `?still` mode and
the playground's are the same trick, and the worker asks its own `name`.

Into the render worker entry, in development only:

```ts
import * as __gessoImported0 from './AppRoot';
const __gessoLatest = [__gessoImported0];
if (import.meta.hot) {
  import.meta.hot.accept(['./AppRoot'], replaced => {
    replaced.forEach((module, index) => {
      if (module !== undefined) {
        __gessoLatest[index] = module;
      }
    });
    __gessoRenderRoot.app.reload(__gessoLatest[0].AppRoot, [__gessoLatest[0].Feed]);
  });
}
```

The modules it accepts are the one the root component was imported from
and the one each `useService` argument came from, because
[a registry is keyed by the class object](/tooling/hot-module-replacement)
and a replacement has to be handed over. A service declared beside the
root, which is what most applications do, needs no second dependency.

Two things it deliberately does not wire. `useRoutes` is read once when
the runtime is built, so a change to a route table is a full reload
rather than a replacement that would leave the old routes resolving. And
a `renderRoot(<App />)` whose argument is not a plain name gets no
wiring at all, with a message saying so: a replacement has to be looked
up by name in the module that changed.

## The error overlay, by default

While the dev server is running, `onError` is wired to a reporter that
loads `gesso-devtools` the first time something throws and draws the
[overlay](/structure/errors-and-the-overlay) over the application. It is
lazy in both directions: a page that never throws never fetches the
package, and a production build contains no reference to it, because
the plugin emits none of this outside a dev server.

The overlay covers the element the application was mounted into, found
as the canvas's parent. A page hosting several applications should turn
this off and mount its own, since one canvas is a guess:

```ts
gesso({ overlay: false });
```

What a shipped application wants instead is
[its own reporter](/tooling/reporting-errors).

## The warning that saves an afternoon

The failure that looks like a bug in the framework: you save a
component, the page reloads instead of replacing the tree, and nothing
anywhere says why.

The cause is almost always that the module is reachable from the main
thread as well as from the render worker. A bundler propagates an
invalidation up the import graph until it finds a module that accepts;
your main thread accepts nothing, so the whole page goes. The plugin
knows both ends of that graph, so it walks the importers and says so:

```text
[gesso] src/App.tsx is imported by the main thread as well as by the
render worker, so saving it reloads the page instead of replacing the
tree. Reach it only from the render worker's own graph to get hot
replacement back.
```

Once per file per session, in the dev server's own output. `gesso({
diagnostics: false })` turns it off.

## Options

| Option           | Default    | What it does                                                          |
| ---------------- | ---------- | --------------------------------------------------------------------- |
| `renderWorker`   | discovered | The render worker entry, as a specifier beside the shell              |
| `appLogicWorker` | discovered | The application worker entry, or `false` for an app with none         |
| `overlay`        | `true`     | Wire the error overlay into `onError` while the dev server is running |
| `hmr`            | `true`     | Emit the `import.meta.hot.accept` wiring                              |
| `diagnostics`    | `true`     | Report a save that will reload the page                               |

## Is it required?

No, and that is deliberate. The framework imports no bundler, and nothing in `gesso-core` or `gesso-framework`
mentions Vite. The plugin is the supported path for development because
it is the one that gets the wiring right on your behalf; the literal
construction is the documented fallback, it is what the plugin emits,
and an application that would rather say it out loud loses nothing but
the overlay and the hot replacement it would then wire itself.

## Next

[Hot module replacement](/tooling/hot-module-replacement): what a reload
keeps, what it costs, and the one thing you still have to hand over.

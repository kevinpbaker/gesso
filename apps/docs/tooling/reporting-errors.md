---
description: What a shipped Gesso application does with a failure the overlay would have drawn, and the shape of the reporter that receives it.
---

# Reporting errors in production

The [error overlay](/structure/errors-and-the-overlay) is a development
tool, and [the plugin](/tooling/vite-plugin) wires it in only while the
dev server is running. A production build contains no reference to
`@gesso/devtools` at all.

That leaves a question a shipped application has to answer, and the
answer is one function. `onError` is the whole of it, in both
configurations, and it is the same callback the overlay is:

```ts
createApp({
  onError: (message, stack, source) => {
    reportToYourService({ message, stack, source, release: BUILD_ID });
  }
}).mount('#app');
```

## The shape

```ts
type ErrorReporter = (message: string, stack: string | undefined, source: RuntimeErrorSource) => void;
```

`stack` is a string and not an `Error`, because the failure happened on
another thread: what crosses the barrier is what the engine wrote, and
the live object with its `cause` stayed in the worker. That is also why
this is the only place a report can be taken from. There is no
`window.onerror` on the page that will hear a render worker's exception
for you, and the one browser copy that does surface at the parent
arrives with no stack and no source.

`source` is the useful field, because what threw matters less than what
is now broken:

| `source`   | What is broken now                                               |
| ---------- | ---------------------------------------------------------------- |
| `listener` | One handler did not run. The event reached the rest of the tree. |
| `message`  | One input, resize or the first build of the tree was dropped.    |
| `uncaught` | A frame did not finish; the surface may show a stale picture.    |
| `renderer` | Nothing is painting. Layout and state are intact.                |
| `channel`  | The view is intact and the data behind it has stopped arriving.  |

Treat `renderer` and `uncaught` as the two worth waking somebody for:
they are where the person is looking at a picture that is no longer
true. A `listener` report is a bug like any other.

## Give the frames somewhere to land

A stack from a production bundle names a minified chunk with a
five-figure line number, and it is useless without the map. Every
`@gesso/*` package ships one beside its `dist`, and your own build
should too:

```ts
export default defineConfig({
  plugins: [gesso()],
  build: { sourcemap: true }
});
```

Whether you serve the maps publicly or upload them to whatever receives
your reports is your call; what matters is that they exist, because they
cannot be reconstructed afterwards.

Bear one thing in mind when you look at a mapped frame: it may be two
maps deep. A frame inside `@gesso/framework` maps first into the
package's own `dist/index.js`, and only then into the TypeScript
somebody wrote, because a bundler's map of a dependency does not chain
to the map that dependency shipped. The overlay follows the chain;
whatever you send reports to has to as well, or it will stop at the
`dist` file and tell you nothing.

## What a reporter should not do

**Do not rethrow.** The runtime has already decided what a failure
costs, and every one of the five sources is a place where it kept the
application running deliberately. A reporter that throws turns a handler
that did not run into an application that stopped.

**Do not draw the overlay.** It is a development tool with a development
tool's trades: it fetches source maps, keeps every distinct error of the
session, and covers the application it is reporting on. What a person
using a shipped application needs is whatever your product says when
something has gone wrong.

**Do not assume it is called once.** An error thrown every frame arrives
every frame. Deduplicate on the message and the stack, as the overlay
does, before anything crosses the network.

## What still reaches only the console

Two failures take neither route, in development or in production: a
binding whose Observable errors, and a modifier that throws in `attach`,
`update` or `detach`. Both are caught by the graph, logged, and unbound.
In the worker configuration that log is the render worker's console,
which nothing outside the worker reads.

[Errors and the overlay](/structure/errors-and-the-overlay) says why,
and it is the page to read if a value on screen has quietly stopped
updating with nothing reported.

## Next

[The Vite plugin](/tooling/vite-plugin): what wires the overlay in
during development, and what it deliberately leaves out of a build.

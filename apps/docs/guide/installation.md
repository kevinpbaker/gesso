---
description: Set up a project against the Gesso packages, and choose between the worker and single-thread configurations.
---

# Installation

Gesso is four packages and a bundler that understands workers. A Gesso
project is an ordinary Vite project that happens to draw its interface
into a canvas, with no build step of its own and one optional plugin:
[`@gesso/vite-plugin`](/tooling/vite-plugin) writes the worker
construction, the hot-replacement wiring and the development error
overlay, all of which you can also write yourself.

The quickest way to get one is the scaffold,
[create-gesso-app](/tooling/create-gesso-app), which writes every file
on this page for you. Read on if you want to know what those files are
and why, or to set a project up by hand.

## The packages

| Package             | What it is                                                                   |
| ------------------- | ---------------------------------------------------------------------------- |
| `@gesso/core`       | The engine: elements, layout, the two renderers, input, text, theming        |
| `@gesso/framework`  | Components, cells, the runtime, the shells, channels, routing                |
| `@gesso/components` | The component library: inputs, overlays, structure, data, media              |
| `@gesso/testing`    | `renderTest` and its queries, for testing a component with no browser at all |

`@gesso/core` and `@gesso/framework` are what an application always
needs. `rxjs` is a peer of both: an Observable is the binding, so it is
your dependency as much as theirs.

::: warning Not on a registry yet
These packages are not published. A project consumes them from tarballs
today: run `pnpm pack` in each package directory and install the files.
The scaffold does this for you and writes `file:` specifiers pointing at
them.
:::

```json
{
  "dependencies": {
    "@gesso/core": "^0.1.0",
    "@gesso/framework": "^0.1.0",
    "@gesso/components": "^0.1.0",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@gesso/testing": "^0.1.0",
    "vite": "^8.2.0",
    "vitest": "^4.1.10"
  }
}
```

## TypeScript

Nothing exotic. `moduleResolution: "bundler"` is the line that has to be
right, because the packages ship `exports` maps. The two `jsx` lines let
you write elements as markup, which is how this site's examples are
written.

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM"],
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
    "strict": true,
    "noEmit": true,

    "jsx": "react-jsx",
    "jsxImportSource": "@gesso/framework"
  },
  "include": ["src"]
}
```

JSX here is a spelling, not a runtime. It compiles onto the element
factories and produces the identical tree, so these two lines are the
whole of the difference:

```tsx
<row gap={8} y="center">
  <text text="Ready" />
</row>
```

```ts
Row({ gap: 8, y: 'center' }, Text({ text: 'Ready' }));
```

Drop the `jsx` lines and the second form still works. Nothing in the
framework requires JSX, and there is no runtime cost either way. The
documentation uses markup because nested layout reads better as markup.

## A host to draw into

The canvas is sized to its host element, so the host needs a size. This
is the whole of the HTML a Gesso application needs:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My app</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
      }
      #app {
        width: 100vw;
        height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Two configurations

**The worker route is the one to build on.** Components, layout, paint
and input all run in a render worker; the main thread creates the
canvas, forwards events and does nothing else, so main-thread work
cannot delay a frame.

```ts
// main.ts: the main thread's entire job
import { createApp } from '@gesso/framework';

createApp({
  // Written out literally: a bundler only emits a chunk for a worker it
  // can see constructed.
  renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' })
}).mount('#app');
```

```ts
// app.render.worker.ts: everything the person sees
import { renderRoot } from '@gesso/framework';
import { App } from './App';

renderRoot(App);
```

A component cannot cross `postMessage`, which is why the root is named
inside the worker rather than passed to it. That one constraint is the
reason for the second file.

**Single-thread** mounts the same tree on the calling thread:

```ts
import { createApp } from '@gesso/framework';
import { App } from './App';

createApp(App).mountSync('#app');
```

Use it for tests, for headless rendering, and where `OffscreenCanvas` is
not available. It is not the default for an interactive application,
because everything the framework does is then competing with everything
else on the main thread.

Both configurations run the identical runtime, so a screen written for
one runs unchanged on the other.

## Check it works

Draw something with no state in it at all:

```tsx
// App.tsx
export const App = (
  <column gap={8} padding={24}>
    <text text="Hello from a worker" />
  </column>
);
```

There is no import: the elements are intrinsic, resolved by
`jsxImportSource`, the same way `<div>` needs no import in React.

`npm run dev`, and the text is on a canvas. [Your first
component](/guide/counter) is the next ten minutes.

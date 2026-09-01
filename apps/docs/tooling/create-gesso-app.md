---
description: Scaffold a Vite project whose interface is built, laid out, painted and hit-tested in a render worker.
---

# create-gesso-app

The scaffold writes an ordinary Vite project. That is the point of it:
nothing it produces is special, so nothing you read elsewhere on this
site depends on having used it. It exists because the worker
configuration has four files that have to agree with each other, and
getting them wrong produces a blank canvas rather than an error.

```bash
pnpm create:app ../my-app
```

| Option              | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `--name <name>`     | Package name for the new project; defaults to the directory's own |
| `--template <name>` | Which template to write. Only `web` exists                        |
| `--force`           | Write into a directory that already has files in it               |
| `--no-build`        | Pack without rebuilding the packages first                        |

## What it writes

```text
index.html        a host element with a size, and nothing else
tsconfig.json     bundler resolution, and the two lines that buy JSX
vite.config.ts    empty, because Gesso needs no plugin
src/main.ts       the main thread: name the worker, mount into #app
src/worker.ts     the render worker: name the root component
src/App.tsx       the screen
vendor/           the three Gesso packages, packed
```

Four of those are worth knowing about even if you write them yourself.

**`src/main.ts` writes the worker constructor out literally.**

```ts
const app = createApp({
  renderWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
});
app.mount(document.querySelector('#app')!);
```

`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
has to appear exactly like that. A bundler recognises the shape
statically and emits a chunk for it; assemble the URL in a variable
first and it emits nothing, and the app fails at run time rather than
at build time.

**`src/worker.ts` is one line.** `renderRoot(App)`. The root component
cannot be passed from the main thread, because a class reference does
not survive `postMessage`: it has to already be inside the worker that
renders it, which is why the two configurations are two shapes of
`createApp` rather than one with a flag.

**`index.html` gives the host element a size.** A canvas in a
zero-height element paints nothing, and there is no error for it.

**`tsconfig.json` carries the two lines that buy JSX:**

```json
{ "jsx": "react-jsx", "jsxImportSource": "@gesso/framework" }
```

JSX compiles onto `createElement` and adds nothing at run time, so
nothing in the framework requires it. It is what the examples and this
site are written in.

## Why the packages are vendored

Gesso is not published. A template with a version range would scaffold
a project that cannot install, so the CLI packs `@gesso/core`,
`@gesso/framework` and `@gesso/components` into the project's
`vendor/` and writes `file:` specifiers pointing at them.

The consequence is that the scaffold has to run from inside this
workspace, and that a scaffolded project is pinned to the packages as
they were when you ran it. Rerun the scaffold, or repack by hand, to
move it forward. When there is a registry this goes away.

Use npm in the generated project. pnpm resolves the packages' own
declared dependencies against the registry and gets a 404 for packages
that are not there.

## No Electrobun template yet

`--template electrobun` prints why and creates nothing. The adapter
`@gesso/electrobun` is roadmap E1 and has not been written, so the
template would scaffold a project with nothing to depend on. The
application code is the same either way: an Electrobun window is a
webview, and a Gesso app inside one is the app you already have.

## Checking it still works

`pnpm check:scaffold` runs the whole thing and is part of the
repository's gates: scaffold into a temporary directory, install,
typecheck, build, start the dev server the CLI printed, and drive it in
headless Chrome. It asserts that the canvas was transferred to the
worker and that a click repaints, and that the worker constructor and
the two `jsx` lines survived into the generated files.

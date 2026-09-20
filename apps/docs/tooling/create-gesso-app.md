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
| `--template <name>` | Which template to write: `web` (the default) or `electrobun`      |
| `--force`           | Write into a directory that already has files in it               |
| `--no-build`        | Pack without rebuilding the packages first                        |

## What it writes

```text
index.html          a host element with a size, and nothing else
tsconfig.json       bundler resolution, and the two lines that buy JSX
vite.config.ts      one plugin: gesso-vite-plugin
pnpm-workspace.yaml the vendored tarballs again, for pnpm
src/main.ts         the main thread: create the app, mount into #app
src/worker.ts       the render worker: name the root component
src/App.tsx         the screen
vendor/             the Gesso packages, packed
```

Four of those are worth knowing about even if you write them yourself.

**`src/main.ts` names no worker.**

```ts
const app = createApp();
app.mount(document.querySelector('#app')!);
```

[`gesso-vite-plugin`](/tooling/vite-plugin) finds `worker.ts` beside
it and writes the construction, which has to appear literally as `new
Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`: a
bundler recognises that shape statically and emits a chunk for it, and
assembling the URL in a variable first emits nothing and fails at run
time rather than at build time. The plugin also draws the error overlay
over the app when the worker throws, and replaces the screen when you
save `App.tsx` instead of reloading the page. Writing the construction
yourself still works, and the plugin then leaves it alone.

**`src/worker.ts` is one line.** `renderRoot(App)`. The root component
cannot be passed from the main thread, because a class reference does
not survive `postMessage`: it has to already be inside the worker that
renders it, which is why the two configurations are two shapes of
`createApp` rather than one with a flag.

**`index.html` gives the host element a size.** A canvas in a
zero-height element paints nothing, and there is no error for it.

**`tsconfig.json` carries the two lines that buy JSX:**

```json
{ "jsx": "react-jsx", "jsxImportSource": "gesso-framework" }
```

JSX compiles onto `createElement` and adds nothing at run time, so
nothing in the framework requires it. It is what the examples and this
site are written in.

## Why the packages are vendored

Gesso is not published. A template with a version range would scaffold
a project that cannot install, so the CLI packs `gesso-core`,
`gesso-framework`, `gesso-components`, `gesso-devtools` and
`gesso-vite-plugin` into the project's `vendor/` and writes `file:`
specifiers pointing at them. The last two are development dependencies:
the plugin writes the wiring, and it loads the overlay from devtools the
first time the render worker throws.

The consequence is that the scaffold has to run from inside this
workspace, and that a scaffolded project is pinned to the packages as
they were when you ran it. Rerun the scaffold, or repack by hand, to
move it forward. When there is a registry this goes away.

**pnpm and npm both work.** The packed packages ask each other for
version ranges no registry can answer, so each package manager has to be
pointed at the tarballs: `overrides` in `package.json` is what npm
reads, and `overrides` in `pnpm-workspace.yaml` is the only place pnpm
11 reads them from. The CLI writes both. They are deleted together with
`vendor/` the day the packages are published.

## The Electrobun template

`--template electrobun` writes a project that opens in a native window:
a counter served from the main process, a button that opens a second
window over the same source, and a switch that changes the appearance
every window is told about. [Desktop windows](/structure/desktop-windows)
explains the arrangement.

It needs one thing the web template does not. Electrobun is delivered
by a launcher called Hutch rather than by a package manager, so the
generated project is set up with `hutch install` and run with `hutch run
dev`, and `hutch electrobun prepare` is what puts the SDK inside the
project. The generated README says how to get `hutch` if it is not on
your path.

On 2026-09-16 a project written by this template was installed,
typechecked, built and opened in a native window on Linux with
WebKitGTK: the counter painted `0` in the dark appearance, a press on
**Count** crossed to the main process and the window painted `1`, the
**Dark** switch turned the window light, and **New window** opened a
second window already reading `1`. Nothing has been run on WKWebView or
WebView2. [Gesso on Electrobun](/structure/gesso-on-electrobun) is the
guide from scaffold to window, and says what was and was not checked;
[Desktop windows](/structure/desktop-windows) is the four files the
arrangement takes. The application code is the same either way: an
Electrobun window is a webview, and a Gesso app inside one is the app
you already have.

## Checking it still works

`pnpm check:scaffold` runs the whole thing and is part of the
repository's gates: scaffold into a temporary directory, install,
typecheck, build, start the dev server the CLI printed, and drive it in
headless Chrome. It asserts that the canvas was transferred to the
worker and that a click repaints, that the plugin is still in the
config and `main.ts` still names no worker, and that the two `jsx` lines
survived into the generated files.

`pnpm check:scaffold:electrobun` does the same for the Electrobun
template as far as a machine without a display can: scaffold, `hutch
install`, `hutch run typecheck`, a development bundle whose page, render
worker chunk and main process bundle are inspected, and the
distributable build. It needs Hutch, found through `HUTCH`, the path, or
where the Electrobun npm bootstrap caches it, and it downloads nothing
itself. No gate opens the window; the guide records the day one was.

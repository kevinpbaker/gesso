# {{name}}

A Gesso application in a native window. The interface is built, laid
out, painted and hit-tested in a render worker; the window's own main
thread carries frames between that worker and the main process and does
nothing else. The state lives in the main process, so every window is a
replica of one source and two windows agree without anything
synchronising them.

```
main process (Cottontail)               window 1              window 2
  count: BehaviorSubject             shell + worker        shell + worker
  Counter channel          ------>   replica -> screen     replica -> screen
  DesktopWindows channel   <------   commands              commands
```

## Getting the toolchain

Electrobun 2.x is delivered by a launcher called **Hutch**, not by a
package manager. `hutch electrobun prepare` projects the SDK into
`.hutch/devkit` inside this project, which is why there is no
`electrobun` entry in `package.json` and why adding one would not help:
the npm package of that name is only a bootstrap that downloads the
toolchain.

If `hutch` is not on your path yet, the bootstrap is what puts it there:

```sh
npx electrobun@2.0.1 init --template=vanilla-vite   # in a scratch directory
```

`HUTCH_HOME` can point somewhere disposable to keep the downloaded
toolchain out of `~/.hutch`.

## Running it

```sh
hutch install       # dependencies, including the vendored Gesso packages
hutch run dev       # prepare, build the window's assets, open the window
```

`hutch run build` makes a distributable build, and `hutch run typecheck`
checks the types without building. Every script runs
`hutch electrobun prepare` first, because both `vite.config.ts` and
`tsconfig.json` read the SDK out of `.hutch/devkit` and neither can be
loaded before it exists.

Press **Count** and the number changes. Press **New window** and a
second window opens already showing the current value, because it
replicates the same source rather than being handed a copy. Flip
**Dark** and every open window changes appearance, because the
appearance is the main process's setting and not the window's.

## What is where

| Path                        | What it is                                                              |
| --------------------------- | ----------------------------------------------------------------------- |
| `src/shared/Counter.ts`     | The channel both processes import. The whole of what they share.        |
| `src/shared/rpc.ts`         | The one message a window and the main process exchange.                 |
| `src/main/index.ts`         | The main process: the state, the windows, and what a link outside does. |
| `src/view/main.ts`          | A window's main thread: build the bridge, mount, and nothing else.      |
| `src/view/render.worker.ts` | The render worker: the root component and the channels it attaches.     |
| `src/render/App.tsx`        | The screen.                                                             |

Three lines carry weight:

```ts
renderWorker: () => new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
```

That expression has to stay written out. A bundler emits a chunk for a
worker it can see constructed, and it cannot see through a variable
holding the URL. `electrobun.config.ts` copies the chunk it emits into
the bundle, which is how the worker loads from a `views://` url.

```json
"jsx": "react-jsx",
"jsxImportSource": "@gesso/framework"
```

Those two lines in `tsconfig.json` are the whole of what makes `<row>`
and `<text>` work, and `vite.config.ts` repeats them for esbuild. JSX
here is a spelling rather than a runtime: it compiles onto the element
factories and produces the identical tree.

## The one rule about the window's main thread

A patch goes from the main process into the render worker as a body the
window's main thread carries and never reads. It multiplexes streams
and knows nothing about channels, components or patches. Keep it that
way: the moment that thread has to understand a payload in order to
route it, work that belongs in a worker has moved onto the thread that
draws, and a frame can be late because of it.

## Why the main process is not pre-bundled

`electrobun.config.ts` points Cottontail at `src/main/index.ts` and lets
Electrobun bundle it, which is the ordinary arrangement. Gesso's own
Electrobun applications do not do this: they pre-bundle their main
process with esbuild first, because they import the framework out of a
workspace rather than out of `node_modules`, and a bundler cannot
resolve a package that was never installed. Here the packages are
installed, in `vendor/`, so the ordinary arrangement is the right one.

If a future toolchain ever fails to resolve `@gesso/electrobun` from the
main process, that is the escape hatch: bundle `src/main/index.ts` to a
plain `.js` file with `electrobun/main` left external, and point the
`cottontail.entrypoint` at the bundle instead.

## Why `vendor/` exists, and how to remove it

Gesso is not published to a registry yet. A `package.json` naming a
version of `@gesso/core` would produce a project that cannot install, so
`create-gesso-app` packed the packages out of its own workspace, put the
tarballs in `vendor/` and pointed `dependencies` and `overrides` at
them:

```json
"@gesso/core": "file:vendor/gesso-core-0.1.0.tgz"
```

`overrides` is there because the packages declare each other by version
range, and without it an installer is free to go looking for
`@gesso/core@^0.1.0` on a registry that has never heard of it.

To pick up a change made in the Gesso workspace, run `create-gesso-app`
again over this directory with `--force`, or repack by hand:

```sh
cd path/to/gesso && pnpm --filter './packages/*' build
cd packages/core && pnpm pack --pack-destination path/to/this/project/vendor
```

When the packages are published this all goes away: delete `vendor/`,
delete `overrides`, and put version ranges back in `dependencies`.

## Where to go next

- `src/render/App.tsx` is commented with what each part of it is doing.
- A channel is the barrier: view keys out, typed commands in, plain
  data only. Add a key to `CounterView`, serve it in `src/main`, read it
  in a component, and nothing in between has to change.
- A command crossing to the main process costs about a frame and a
  half, because every message is serialised, encrypted and sent over a
  socket. Patches are one way and pipelined, so they do not pay it;
  anything that waits for an answer does.
- `@gesso/components` has the controls: inputs, overlays, structure,
  data and media. `Switch` in `App.tsx` is one of them.

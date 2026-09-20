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

If `hutch` is not on your path yet, the bootstrap is what fetches it.
Any command will do; this one only prints Hutch's help:

```sh
npx electrobun@2.0.1 --help
```

That leaves the launcher at
`~/.hutch/npm/electrobun/2.0.1/<platform>/bin/hutch` (for example
`linux-x64` or `darwin-arm64`). Put that directory on your path, or call
the binary by its full path. `HUTCH_HOME` can point somewhere disposable
to keep the downloaded toolchain out of `~/.hutch`; the launcher then
lands under that directory instead.

## Running it

```sh
hutch install       # dependencies, including the vendored Gesso packages
hutch run dev       # prepare, build the window's assets, open the window
```

`hutch install` runs npm underneath, because `hutch.config.ts` says
`packageManager: 'npm'`: Hutch's own resolver reads a relative `file:`
override against the package that asked for it rather than against this
directory, and stops with `FileNotFound` on the second vendored package.
npm reads `overrides` from here, which is what the tarballs in `vendor/`
need. You will see a `package-lock.json`, and no `hutch.lock`.

`hutch run build` makes a distributable build under `build/stable-*`,
and `hutch run typecheck` checks the types without building. Every
script runs `hutch electrobun prepare` first, because both
`vite.config.ts` and `tsconfig.json` read the SDK out of `.hutch/devkit`
and neither can be loaded before it exists.

The first line of `hutch.config.ts` pins the Hutch that runs these
scripts to 0.24.3, the one the bootstrap above installs. The comment
under it says why: the newer launcher fails the distributable build.
Leave the line first in the file.

In a development build, what the window logs to its console is printed
by the main process, prefixed `[webview:1]`, so `console.log` in a
component or in `src/view/main.ts` lands in the terminal you ran
`hutch run dev` from.

### Linux, on a Wayland desktop

Electrobun opens its window as an X11 client, so under a Wayland
compositor it runs through XWayland. On the machine this template was
checked on (Hyprland, an NVIDIA GPU, WebKitGTK 2.52) the window came up
as a blank surface: the log said `Failed to create GBM buffer` twice,
the page had loaded, and nothing was ever composited. Putting

```sh
WEBKIT_DISABLE_DMABUF_RENDERER=1 hutch run dev
```

in the environment made it paint. It has to be in the environment of
the launch; setting it from `src/main/index.ts` is too late, because
the webview reads it as it starts. Nothing about this is Gesso's, and a
desktop where the log has no GBM line does not need it.

## What has been checked

On 2026-09-16, on Linux x64 with WebKitGTK 2.52.6 and Electrobun 2.0.1,
a project written by this template was installed by `hutch install`,
typechecked by `hutch run typecheck`, built by `hutch run build` to
`build/stable-linux-x64`, and opened by `hutch run start` with the
variable above set. The window painted in the dark appearance with the
counter at `0`. A press on **Count** reached the main process, which
logged the increment, and the window painted `1`. A press on **Dark**
turned the window light. A press on **New window** opened a second
window already reading `1`, `2 windows, one source`, and light. The
presses were dispatched to the canvas from inside the page, because
that desktop had no way to inject a pointer into an X11 window; the
path from the canvas inward is the one a real pointer takes, and the
path from a real pointer to the canvas is the platform's.

Nothing has been run on macOS or Windows, so on WKWebView and WebView2
this project is a build and a first window away from being known to
work. `hutch run dev` was not used for the check, only `hutch run
start`, which is the same command without `--watch`.

Press **Count** and the number changes. Press **New window** and a
second window opens already showing the current value, because it
replicates the same source rather than being handed a copy. Flip
**Dark** and every open window changes appearance, because the
appearance is the main process's setting and not the window's, and
because `App.tsx` binds its theme to what the shell reports.

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
"jsxImportSource": "gesso-framework"
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

If a future toolchain ever fails to resolve `gesso-electrobun` from the
main process, that is the escape hatch: bundle `src/main/index.ts` to a
plain `.js` file with `electrobun/main` left external, and point the
`cottontail.entrypoint` at the bundle instead.

## Why `vendor/` exists, and how to remove it

Gesso is not published to a registry yet. A `package.json` naming a
version of `gesso-core` would produce a project that cannot install, so
`create-gesso-app` packed the packages out of its own workspace, put the
tarballs in `vendor/` and pointed `dependencies` and `overrides` at
them:

```json
"gesso-core": "file:vendor/gesso-core-0.1.0.tgz"
```

`overrides` is there because the packages declare each other by version
range, and without it an installer is free to go looking for
`gesso-core@^0.1.0` on a registry that has never heard of it.

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
- `gesso-components` has the controls: inputs, overlays, structure,
  data and media. `Switch` in `App.tsx` is one of them.

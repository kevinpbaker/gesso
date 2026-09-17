---
description: 'Gesso on Electrobun from scaffold to native window: the process model, the adapter, the Hutch toolchain, developing and building, and exactly which webview engines have been run.'
---

# Gesso on Electrobun

This is the guide from nothing to a native window. It assumes you have
read [desktop windows](/structure/desktop-windows), which explains the
arrangement and the four files an Electrobun application is made of;
this page is about getting one running, and about what has actually
been seen running. Every claim on it comes from one fresh scaffold,
opened on Linux with WebKitGTK on 2026-09-16, and the last section says
what that leaves out.

## The shape

An Electrobun application is a main process and some windows. The
main process is where Gesso puts the application layer: the data, the
files, the domain and view models, published as channels. Each window
is a webview, and inside it the application is the one you already
know from the web: a render worker holding the components, layout,
paint and hit-testing, and a main thread that does the shell's job.

```
main process (Cottontail)            window 1                 window 2
  count: BehaviorSubject           shell + render worker   shell + render worker
  Counter channel          ──▶     replica ──▶ screen      replica ──▶ screen
  DesktopWindows channel   ◀──     commands                commands
```

What differs from the web is one thing: the other end of a window's
channels is a process, not a worker in the same page, and the two are
joined over Electrobun's RPC. The window's main thread carries frames
between the render worker and the RPC and never reads them. A channel
does not know, a component does not know, and a screen written for a
data worker runs unchanged. That is the whole claim of the adapter, and
it held from the first window of the scaffold.

## The adapter

`@gesso/electrobun` is four entries, split so that the two processes
cannot import each other's half:

| Import                      | Runs where              | Holds                                           |
| --------------------------- | ----------------------- | ----------------------------------------------- |
| `@gesso/electrobun`         | both                    | `GessoFrame`, the wire format, and nothing else |
| `@gesso/electrobun/view`    | a webview's main thread | `createElectrobunBridge`                        |
| `@gesso/electrobun/main`    | the main process        | `serveChannelsToWindow`                         |
| `@gesso/electrobun/desktop` | the main process        | `createDesktopApp`, `windowsChannel`            |

The package imports nothing from Electrobun. Its toolchain projects the
SDK into a project rather than installing it, so the adapter cannot
depend on it, and instead an application hands over the two
Electrobun-shaped things itself: a function that opens a window and a
`send` per window. In the scaffold that is the `open` callback of
`createDesktopApp`, and it is a dozen lines. Everything else is the
adapter's.

## Scaffolding

From inside the Gesso workspace:

```bash
pnpm create:app ../my-app --template electrobun
```

The CLI packs `@gesso/core`, `@gesso/framework`, `@gesso/components`
and `@gesso/electrobun` into the project's `vendor/`, because none of
them is on a registry yet, and writes `file:` specifiers and
`overrides` pointing at the tarballs. What it writes:

```text
electrobun.config.ts     what Electrobun builds: the main process entry, the assets to copy
hutch.config.ts          what `hutch run <script>` does, and which Electrobun to fetch
vite.config.ts           the window's assets, with one alias list for the projected SDK
tsconfig.json            extends the projected SDK's config; bundler resolution; the two JSX lines
src/shared/Counter.ts    the channel both processes import
src/shared/rpc.ts        the one RPC message both sides exchange
src/main/index.ts        the main process: the state, the windows
src/view/main.ts         a window's main thread: the bridge, then mount
src/view/render.worker.ts  the render worker: the root component and its channels
src/render/App.tsx       the screen
vendor/                  the Gesso packages, packed
```

The screen is an ordinary component. It reads the counter's replica
through `ctx.channel`, and it binds its theme to the appearance the
shell reports, because the framework carries the appearance and has no
opinion about what dark looks like:

```tsx
export function App(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const counter = ctx.channel(Counter);
  const theme = ctx.inject(ShellService).colorScheme.pipe(map(scheme => (scheme === 'dark' ? darkTheme : lightTheme)));

  return (
    <column theme={theme} textStyle={theme.pipe(map(value => value.typography.body))} backgroundColor="background">
      <text text={counter.view.count.pipe(map(String))} fontSize={56} />
      <button label="Count" onClick={() => counter.send.increment(1)}>
        <text text="Count" color="background" />
      </button>
    </column>
  );
}
```

That `theme` line is one of the things the first opened window found
missing. Without it the main process's `dark` reached the switch on
screen and changed nothing else, because no theme was listening.

## The toolchain

Electrobun 2.x is not installed by a package manager. A launcher called
**Hutch** downloads the runtime and SDK into `~/.hutch` (or
`$HUTCH_HOME`) and projects a devkit into the project at
`.hutch/devkit`, which is where `vite.config.ts` and `tsconfig.json`
read `electrobun/main` and `electrobun/view` from. The npm package
`electrobun` is only a bootstrap for the launcher:

```bash
npx electrobun@2.0.1 --help
# leaves the launcher at ~/.hutch/npm/electrobun/2.0.1/<platform>/bin/hutch
```

Two lines in the generated `hutch.config.ts` are there because the
first fresh scaffold needed them. `packageManager: 'npm'` makes `hutch
install` run npm underneath, because Hutch's own resolver reads a
relative `file:` override against the package that asked for it rather
than against the project, and stops at the second vendored package.
And the pragma on the first line, `// @hutch cli=0.24.3`, pins the
launcher, because the newest one (0.26.0) fails the distributable
build: it expects a `cottontail-core` binary the Cottontail release
Electrobun 2.0.1 bundles does not ship. Both go away when the packages
are published and the toolchain moves on; both are commented in the
file.

## Developing

```bash
cd ../my-app
hutch install       # npm underneath; the vendored packages and vite
hutch run dev       # prepare, build the window's assets, open the window, watch
```

Every script begins with `hutch electrobun prepare`, because that is
what writes `.hutch/devkit`, and neither the Vite config nor the
TypeScript config can be loaded before it exists. Then Vite builds the
window's assets into `dist/`, Electrobun copies `dist/index.html` and
`dist/assets` into the bundle under `views/mainview/`, bundles
`src/main/index.ts` for the main process, and the launcher starts.
`hutch run start` is the same without the watch; `hutch run dev:hmr`
serves the assets from Vite's dev server instead, so a saved component
reloads the webview without a native rebuild.

Two things about a development build are worth knowing before you
need them:

- **The window's console reaches your terminal.** What a component or
  `src/view/main.ts` logs is printed by the main process as
  `[webview:1] [console.log] …`. The scaffold's first window was
  verified partly through this.
- **The window is an X11 client.** On Linux the native wrapper opens
  its window through X11, so on a Wayland desktop it runs under
  XWayland, and the compositor sizes it as it does any new window. A
  tiling compositor will ignore the `frame` you asked for, which is not
  a defect in anything, but it is what an earlier record of this
  project called an unresolved resize. Floated and resized, the canvas
  followed.

### Linux, on a Wayland desktop with an NVIDIA GPU

On the machine the scaffold was opened on (Hyprland, an RTX 4070,
WebKitGTK 2.52.6) the first window was a blank surface: the log said
`Failed to create GBM buffer` twice, the page had loaded and the render
worker was running, and nothing was ever composited. This is
WebKitGTK's DMA-BUF renderer failing under XWayland, and the standard
knob fixes it:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 hutch run dev
```

It has to be in the environment of the launch. Setting it from the
main process is too late, because the webview reads it as it starts;
that was tried. A desktop whose log has no GBM line does not need it.
Nothing here is Gesso's, and the scaffold does not set it for you,
because it would turn off an accelerated path on machines that have no
problem with it.

## Building

```bash
hutch run typecheck   # prepare, then tsc --noEmit across both processes
hutch run build       # prepare, vite build, electrobun build --env=stable
```

A distributable lands in `build/stable-<platform>/<name>/`: a
`launcher` binary and a compressed archive under `Resources/` that it
unpacks on first run. The development build is `build/dev-<platform>/`
and leaves its files loose, which is what `pnpm
check:scaffold:electrobun` reads to confirm the page, the render
worker's chunk and the main process bundle are all there.

`bundleCEF` is off in all three platform sections of
`electrobun.config.ts`, so a window is the platform's own webview.
Bundling CEF would put Chromium, and therefore WebGPU, into the
application on every platform at a considerable size. Gesso paints
through a 2D canvas where there is no `navigator.gpu`, so the renderer's
`auto` choice resolves to Canvas2D on WebKitGTK without being told; see
[Canvas2D and WebGPU](/rendering/canvas2d-and-webgpu).

## What works on which engine

Electrobun's window is a different webview on each platform: WebKitGTK
on Linux, WKWebView on macOS, WebView2 (Chromium) on Windows. The
column that matters is the third.

| What                                                           | WebKitGTK (Linux)                    | WKWebView (macOS) | WebView2 (Windows) |
| -------------------------------------------------------------- | ------------------------------------ | ----------------- | ------------------ |
| A module worker loads from `views://`                          | yes                                  | not run           | not run            |
| `OffscreenCanvas` transfers and the render worker paints       | yes                                  | not run           | not run            |
| A channel replicates from the main process                     | yes                                  | not run           | not run            |
| A press crosses to the main process and the window repaints    | yes                                  | not run           | not run            |
| The appearance is pushed to every window and the theme follows | yes                                  | not run           | not run            |
| A second window opens and shows the shared state               | yes                                  | not run           | not run            |
| The window follows a resize                                    | yes                                  | not run           | not run            |
| `prefers-color-scheme` from the webview is trustworthy         | no, it reported light in dark mode   | not run           | not run            |
| WebGPU                                                         | no `navigator.gpu`; Canvas2D is used | not run           | not run            |

The first seven rows come from the fresh scaffold of 2026-09-16 and
from the E1 spike and Desk before it; the eighth is why the main
process tells the window its appearance rather than letting it ask.

## What is unverified

Claiming less than has been seen is the rule on this page, so:

- **WKWebView and WebView2 have never run this framework.** Not known
  to be broken, and not known to work. Both are the same scaffold,
  `hutch install`, and `hutch run dev` on a machine that has them; the
  first window on each is the experiment.
- **No person has pressed the scaffold's button.** The desktop the
  window was opened on had no way to inject a pointer into an X11
  window, so the presses that counted to 1, flipped the appearance and
  opened the second window were pointer events dispatched to the canvas
  from inside the page, at the box the accessibility mirror reported
  for each control. From the canvas inward that is the path a real
  pointer takes; from a real pointer to the canvas is the platform's
  path, and that was not exercised. Keyboard activation through Tab and
  Space was tried twice and did not reach the button, and why was not
  investigated.
- **The semantics mirror did not follow a resize.** Eight seconds after
  the window had been resized and the canvas had repainted at the new
  size, the mirror's boxes still described the old layout, and presses
  derived from them missed. Resizing before the page laid out avoided
  it. This is a framework finding, not an Electrobun one, and it is
  recorded rather than fixed.
- **`hutch run dev` and `dev:hmr` were not used for the check**, only
  `hutch run start`, which is `dev` without `--watch`.
- **Nothing sustained was measured.** The transport figures on
  [desktop windows](/structure/desktop-windows#what-the-transport-costs)
  are bursts, measured once.

## Checking it

`pnpm check:scaffold:electrobun` scaffolds the template into a
temporary directory, runs `hutch install` and `hutch run typecheck`,
builds the development bundle and reads it, and builds the
distributable. It asserts the shape the template has to keep: the
worker construction written out where Vite can see it, the SDK alias in
the Vite config, the two JSX lines, the Hutch pin and the npm selection.
It needs Hutch, found through `HUTCH`, the path, or where the bootstrap
above caches it, and it downloads nothing itself. It cannot open a
window, and nothing headless can; the record of the day one was opened
is `docs/decisions/0092`.

## Next

[Desktop windows](/structure/desktop-windows) is the four files, the
two things the platform is told rather than asked, and what the
transport costs. [create-gesso-app](/tooling/create-gesso-app) is the
scaffold itself.

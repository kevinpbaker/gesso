# gesso-framework

## 0.3.0

### Minor Changes

- 025321a: **Breaking: the single-thread configuration is `createSyncApp`.** `createApp` now
  builds the worker configuration and nothing else.

  ```diff
  -createApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
  +createSyncApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
  ```

  Nothing else changes: same builder, same methods, same `mountSync`. The worker
  form, `createApp({ renderWorker })` and the form `gesso-vite-plugin` writes, is
  untouched, so an application that mounts into a render worker needs no edit.
  `createApp` given a component throws and names `createSyncApp`, because the fix
  is one identifier and a message that does not say which one turns a rename into
  an afternoon.

  The reason is what it costs on the wire. `createApp` took either the options or
  a root component, and the overload that took a component reached
  `GessoAppBuilder` → `GessoApp` → `GessoRuntime`: the layout engine, both
  renderers and the hit-tester, statically, in every shell. A bundler cannot see
  which half of one function a given call reaches, so every worker application
  shipped the whole engine to the thread whose entire job is to create a canvas
  and forward input.

  Measured on the smallest honest shell, built from source:

  |        | raw      | gzipped  |
  | ------ | -------- | -------- |
  | before | 662.9 kB | 169.3 kB |
  | after  | 46.2 kB  | 12.3 kB  |

  And on a real application, gessosheet's shell: 524.9 kB to 152.9 kB raw, 152.7 kB
  to 45.0 kB gzipped. `check-bundle-size.ts` holds the line in CI with a budget and
  with a look for Canvas2D calls in the shell's bytes, because the number alone
  would pass a build that kept the rasterizer and got lucky.

  Two names cost one line in the configuration that was always the exception, and
  take 120 kB off the main thread of every other kind.

- 025321a: **`fanOut`, for when every node wants its own slice.** One source, N things on
  screen, each reading one part of it: a grid, a timeline, a log viewer all arrive
  at this shape, and the natural spelling does not scale. A pipe per slice runs N
  pipelines on every emission whatever changed, and RxJS removes an observer from a
  Subject by scanning its list, so tearing down a window of N is quadratic.

  `fanOut(source, read, { initial })` holds one subscription for the whole registry
  and hands out a stable cell per key. Its `changed` hint is where a frame is won: a
  source that knows which keys a patch touched reads only those. Ten thousand live
  keys, measured against a pipe per key: mount 29.8 ms to 10.7 ms, teardown 9.7 ms
  to 3.7 ms, and one key changing 2.2 ms to 0.1 ms.

  Reach for it when N is large _and each emission touches few of them_. A source
  that republishes its whole window on every scroll gets the cheaper mount and
  teardown and nothing from `changed`, because every key really did change.

  It compares by reference where `select` and `derive` compare by content, which is
  the opposite default for the opposite reason: those run once per emission and this
  runs once per live key per emission. And a registry that has grown past a couple
  of thousand keys having released none of them says so once, because `release` is
  the caller's and forgetting it is the one thing here that goes wrong silently.

  **`tabStop`, which is `tabindex="-1"`.** Focusable, reachable by a press and by
  `focus()`, skipped by the Tab cycle. `focusable` only ever answered "may this node
  hold focus", which is the wrong question for a container: `UiFocusManager.settleScope`
  blurred when a scope held nothing focusable, so a `Dialog` whose content is a
  sentence handed the keyboard to nothing and could not be dismissed with Escape.
  `settleScope` now falls back to the scope root before blurring, and `Dialog` sets
  `focusable: true, tabStop: false` on its body. Both halves are needed and neither
  is enough alone.

  **`borders()`, a border per edge, as paint.** `borderWidth` is one number and
  `borderColor` one colour, so a node could not have a heavy bottom edge and a
  hairline top. A border here is paint-only and a decoration is already a coloured
  rectangle in the node's own paint pass, so four edges are four draw instances and
  no extra nodes. `DecorationBox` gains `right` and `bottom` to put them: any two of
  near edge, size and far edge fix an axis, which is CSS's rule for an absolutely
  positioned box, and the only one that can express a side edge spanning between two
  horizontal ones.

  **`menuBarStep`, a menu bar's keyboard, as a peer of `Menu`.** `Menu` traps focus,
  which is right for a popup opened by a button and wrong for a bar: with focus in
  the panel, ArrowLeft cannot reach the bar to move to the menu next door, and that
  is most of what makes a bar a bar. A pure function, generic in the command type,
  that returns null for a key it does not claim, so a bar can still be tabbed out of.

### Patch Changes

- Updated dependencies [025321a]
- Updated dependencies [025321a]
  - gesso-core@0.3.0

## 0.2.1

### Patch Changes

- gesso-core@0.2.1

## 0.2.0

### Patch Changes

- be07839: **Sound a picture can follow, and a screen it can fill.** Two things
  the render thread cannot do for itself.

  `audioClock` reads where `AudioService` has got to and hands it to
  `videoSource` as a `VideoClock`, so a clip's picture follows the sound
  rather than a tween of its own. `AudioContext` does not exist on a
  worker, so the sound is the shell's to play and this is the adapter
  between them. The source is checked on every read, because one
  `AudioService` serves the whole application and a screen that starts a
  podcast while a clip is mounted would otherwise drive the picture from
  the podcast's position.

  `ShellService.requestFullscreen` asks whichever shell is in front to
  fill the screen with the canvas, and `ShellService.fullscreen` reports
  what actually happened, because a browser only grants fullscreen during
  a gesture and can refuse, and the person can leave with Escape, which
  no request hears about.

  The part that took measuring is the size. A `ResizeObserver` watches
  the host, and the host does not change when the canvas is lifted out of
  it; it reflows _because_ the canvas left. The runtime kept laying out
  at the old size and the browser stretched the result: a canvas whose
  CSS box was 800x600 still had a 768x448 backing store, and every
  coordinate was wrong by the ratio between the two, so a press near the
  bottom of a fullscreen clip landed near the middle of the layout. The
  size now comes from the canvas while it is fullscreen and from the host
  when it is not, read a frame late, because `fullscreenchange` fires
  before the new geometry is in the layout.

- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
  - gesso-core@0.2.0

## 0.1.0

First public release.

Components, cells, the frame runtime, channels, routing and the worker
barrier.

A component body runs once and an `Observable` binds straight into the
retained graph, so there is no re-render pass, no virtual DOM diff and no
`useEffect`. An application is three files across three threads joined by one
contract module: `channel()` names the shapes, `serveChannels` serves them
from the application worker, `renderRoot` draws on the render worker, and
`createApp` on the main thread spawns both and then holds neither end.

`createApp(App).mountSync('#app')` runs the same contract in a single thread,
for tests, headless rendering and environments without `OffscreenCanvas`.

**The accessibility mirror.** The shell writes the semantics tree into an
off-screen DOM over the canvas, so a screen reader, an OS accessibility API or
an automated testing tool sees real elements where before it saw one empty
canvas. On by default in both configurations; `accessibility: false` opts out.
Presses, focus moves and value sets come back as ordinary input.

**Failures reach the shell.** `renderRoot` listens for `error` and
`unhandledrejection` on the worker global, so a component that throws during a
frame is reported rather than lost; `UiInputDispatcher.onListenerError` reports
the exceptions it has to swallow, so an `onClick` that throws is no longer
logged only to a worker console. The protocol's `error` carries a `source` of
`message`, `uncaught`, `renderer`, `channel` or `listener`.

Entry points: the root, `/worker`, `/jsx-runtime`, `/jsx-dev-runtime` and
`/testing`.

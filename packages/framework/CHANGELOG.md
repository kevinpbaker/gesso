# gesso-framework

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

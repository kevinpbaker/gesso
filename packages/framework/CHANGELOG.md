# gesso-framework

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

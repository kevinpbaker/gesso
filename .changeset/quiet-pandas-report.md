---
'@gesso/devtools': minor
'@gesso/framework': minor
'@gesso/core': minor
---

`@gesso/devtools`: an error overlay, and the reporting it needed to have
something to show.

`mountErrorOverlay(host)` returns a `report` matching
`WorkerAppOptions.onError`, so wiring it is one line. It draws the
message over the application, says which of five sources it came from
and what that costs the running app, quotes the original source line
with a caret under the column, and maps every stack frame back through
the source maps — decoded in the package, with no dependency. A repeat
counts instead of stacking up, and a dismissal survives an error that
throws every frame.

Three holes were closed underneath it, and each was a way for a failure
to vanish. `renderRoot` now listens for `error` and `unhandledrejection`
on the worker global, so a component that throws during a **frame**
reaches the shell at all. `UiInputDispatcher.onListenerError` reports the
exceptions it has to swallow, so an `onClick` that throws is no longer
logged only to a worker's console. And `WorkerApp` cancels the browser's
second, information-free report of a worker error at the window, passing
it on only when the worker never answered `ready` — which is how a module
that fails to load arrives.

The protocol's `error` message carries `source`
(`message | uncaught | renderer | channel | listener`) and
`WorkerAppOptions.onError` takes it as a third argument.
`GessoApp.onError` and `GessoAppBuilder.onError` are new: the
single-thread configuration reports the two errors its runtime catches.

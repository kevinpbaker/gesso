---
description: 'The render-worker protocol: every message the shell and the render worker exchange, what each one carries, and why an application never sends one.'
---

# The render-worker protocol

In the worker configuration there are two pieces of framework code and
one channel between them. On the main thread, `WorkerApp` owns the
`<canvas>`, forwards input, and runs the display's refresh loop. In the
render worker, `RenderWorkerApp` owns everything else: components,
layout, hit-testing, focus, paint. The channel between them is a pair of
tagged unions in
`packages/framework/src/app/worker/RenderWorkerProtocol.ts`,
`ShellToRuntimeMessage` going in and `RuntimeToShellMessage` coming
back.

This page is that file, read out. It is here because knowing what
crosses is how the [thread split](/guide/workers) stops being a claim,
and because a stray message in a devtools timeline is easier to read
when you know what sends it.

## It is internal, and you do not speak it

Three types are exported from `@gesso/framework`:
`ShellToRuntimeMessage`, `RuntimeToShellMessage` and
`RuntimeErrorSource`. Nothing else in the module is. The helpers beside
them (`isInputMessage`, `epochNow`, `epochFromEvent`, `modifiersFrom`)
stay unexported, and the module is not a package entry point of its own.

More to the point, both ends are already claimed. `RenderWorkerApp`
installs its own `onmessage` in its constructor, and `WorkerApp`
installs its own on the worker it spawned, so a second listener on
either side would be a second listener on a socket that already has an
owner. An application posts nothing here. It calls `mount()` on one side
and `renderRoot()` on the other, and the two agree on the rest.

What an application uses instead:

| To do this                        | Use                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Copy text, open a url             | `ShellService`, in [shell services](/structure/shell-services)                     |
| Navigate                          | `RouterService`, in [routing](/structure/routing)                                  |
| Reach application state           | a channel, in [channels and the barrier](/structure/channels-and-the-barrier)      |
| See frame timings                 | `WorkerApp`'s `onFrame` option, in [frames and phases](/tooling/frames-and-phases) |
| Hear about an error in the worker | `onError`, in [errors and the overlay](/structure/errors-and-the-overlay)          |

Read the protocol to understand the arrangement or to debug it. Treat
the types as descriptive rather than as an interface to implement: they
are exported so that code holding a message can name it, not so that
another package can put a new shell on the other end.

## What never crosses

No `UiElement`, no component instance, no Observable and no `UiNode`
appears in either union. They are constructed in the render worker and
stay there, which is what keeps the boundary cheap and what makes it
possible at all: a component is a closure over cells, and a closure
cannot be posted.

Routes are the clearest case. An application declares them in the render
worker with `useRoutes`, because a route holds a component class. The
only thing that crosses is a url, in both directions.

The application worker's data path does not cross either. The shell
creates one `MessageChannel`, hands one end to the application worker as
`{ type: 'gesso:hub' }` and the other to the render worker as the
`appPort` field of `init`, and then holds neither end. A patch from a
view model never touches the main thread.

## Shell to render worker

Coordinates are in CSS pixels, relative to the canvas's bounding
rectangle. `modifiers` is `{ shift, ctrl, alt, meta }` throughout.

| Message             | When the shell sends it                                                                            | What it carries                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`              | Once, on `mount`, with the `OffscreenCanvas` transferred alongside it                              | `canvas`, `width`, `height`, `dpr`, an optional `renderer` choice, `textInput`, `accessibility`, and `appPort` when the shell spawned an application worker |
| `resize`            | The `ResizeObserver` on the host element reports a content rect with both dimensions above zero    | `width`, `height`, `dpr`                                                                                                                                    |
| `pointerDown`       | `pointerdown` on the canvas, after capturing the contact so a drag off the edge is still delivered | `x`, `y`, `buttons`, `modifiers`, `pointer`, `at`                                                                                                           |
| `pointerMove`       | `pointermove`                                                                                      | the same fields                                                                                                                                             |
| `pointerUp`         | `pointerup`                                                                                        | the same fields                                                                                                                                             |
| `pointerCancel`     | `pointercancel`, when the browser takes the contact away                                           | `pointer`, `at`                                                                                                                                             |
| `wheel`             | `wheel` on the canvas                                                                              | `x`, `y`, `deltaX`, `deltaY`, `modifiers`, `deltaMode` and `wheelDeltaY` forwarded rather than translated, `at`                                             |
| `keyDown`           | A key press on the canvas, on the editing proxy, or on the accessibility mirror                    | `key`, `modifiers`, `at`                                                                                                                                    |
| `keyUp`             | The matching release                                                                               | `key`, `modifiers`, `at`                                                                                                                                    |
| `beforeInput`       | `beforeinput` on the editing proxy                                                                 | `inputType` in the DOM's own vocabulary, `data`, `at`                                                                                                       |
| `compositionStart`  | An IME composition begins in the proxy                                                             | `at`                                                                                                                                                        |
| `compositionUpdate` | The composition changes                                                                            | `text` so far, `caret` offset within it, `at`                                                                                                               |
| `compositionEnd`    | The composition commits or is cancelled                                                            | `text`, empty when cancelled                                                                                                                                |
| `paste`             | A paste reaches the proxy                                                                          | `text`                                                                                                                                                      |
| `blur`              | The proxy loses focus to something outside the app                                                 | nothing                                                                                                                                                     |
| `visibility`        | Once at start-up, then on every `visibilitychange`                                                 | `visible`                                                                                                                                                   |
| `reducedMotion`     | Once at start-up, then on every change of `prefers-reduced-motion`                                 | `reduced`                                                                                                                                                   |
| `colorScheme`       | Once at start-up, then on every change, or immediately when the host sets an override              | `scheme`, always resolved to `light` or `dark`                                                                                                              |
| `url`               | Once at start-up, then on every back, forward or typed address                                     | `url`                                                                                                                                                       |
| `inspector`         | The host calls `setInspector`                                                                      | `enabled`                                                                                                                                                   |
| `semanticsAction`   | An assistive technology presses, focuses or sets a value in the accessibility mirror               | `action`, addressed by node id rather than by coordinate                                                                                                    |
| `tick`              | Every `requestAnimationFrame`, but only while the runtime has asked for the loop                   | `time`, the rAF timestamp                                                                                                                                   |
| `dispose`           | The application unmounts                                                                           | nothing                                                                                                                                                     |

Three things are worth reading off that table rather than out of it.

**Start-up is not a race the application can lose.** A message that
arrives before `init` finds no runtime and is dropped, which is correct:
there is no tree for it to reach. Everything chained onto `renderRoot`
(`useChannel`, `useService`, `useRoutes`) lands before `init` is
processed, because the handler is installed synchronously in the
constructor.

**Twelve of these are inputs**, and the runtime knows which:
`isInputMessage` names the pointer messages, `wheel`, the two key
messages, and the five editing ones. Those carry `at`, a millisecond
reading on a clock both threads share, taken from the DOM event's own
timestamp. Reading the event's clock rather than stamping inside the
listener is what makes a blocked shell visible: a shell busy for two
seconds runs its listener two seconds late, and a stamp taken there
would record the delay as zero. That number comes back out as
`inputLatencyMs` on the next frame.

**Several fields are optional on purpose.** `pointer`, `deltaMode`,
`wheelDeltaY`, `at` and `textInput` are all absent from a shell written
before they existed, and the runtime reads their absence as the
behaviour it had then: a mouse, pixel deltas, no latency reading, keys
as the only source of text.

## Render worker to shell

The shell owns no UI state, so nothing here is a view update. It is
observability, plus the four things only a thread with a window can
carry out.

| Message         | When the worker sends it                                                             | What it carries, and what the shell does                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ready`         | Once, after the runtime is built and started                                         | nothing                                                                                                                                          |
| `frame`         | Every frame the runtime completes                                                    | `frame`, `durationMs`, `nodes`, `measured`, `relayoutRoots`, `at`, `inputLatencyMs`, `phases`, `renderer`, `gpu`; handed to the `onFrame` option |
| `frameLoop`     | Whenever the runtime starts or stops wanting display refreshes                       | `running`; the shell runs or cancels its `requestAnimationFrame` loop                                                                            |
| `error`         | Anything the worker catches, plus its own `error` and `unhandledrejection` listeners | `message`, `stack`, `source`; handed to the `onError` option                                                                                     |
| `inspect`       | The inspector is on and the hovered node changed                                     | a `UiNodeReport`, or null when nothing is hovered                                                                                                |
| `cursor`        | The hovered node asks for a different cursor                                         | a CSS cursor string, or null; written to `canvas.style.cursor`                                                                                   |
| `scrollability` | Ahead of the wheel it answers for, when the answer changes                           | `scrollability` and `scrollsAnything`; cached for the wheel handler, and mapped onto the canvas's `touch-action`                                 |
| `editing`       | The focused editable's text, selection or caret box changed                          | an `EditingState`, or null when no editable has focus; the editing proxy mirrors it                                                              |
| `clipboard`     | A component called `ShellService.copyText`                                           | `text`; written to the system clipboard                                                                                                          |
| `openUrl`       | A component called `ShellService.openUrl`                                            | `url`; opened with `window.open(url, '_blank', 'noopener,noreferrer')`                                                                           |
| `history`       | `RouterService` navigated                                                            | `action` (`push`, `replace`, `back` or `forward`) and `url`; applied to the address bar                                                          |
| `semantics`     | Per frame with changes, and only while the shell attached a mirror                   | a `UiSemanticsUpdate`: the semantics patches, the boxes that moved, and the focused node when focus moved                                        |

Two of those are shaped by a constraint rather than by taste, and the
shapes look odd until you know which.

`frameLoop` is a state and not a per-frame request. A request per frame
would cost a round trip inside every frame, and a request that reaches
the shell after that vsync's callback has already run waits for the next
one, which halves the frame rate. So the worker says "I want frames" and
"I am idle", and the shell keeps a free-running loop between the two. An
application doing nothing exchanges nothing.

`scrollability` is pushed before it is needed. The shell has to decide
`preventDefault()` synchronously and the runtime is a message away, so
without a cached answer the shell would either swallow every wheel,
making the canvas a scroll trap in the page around it, or swallow none
and let one wheel scroll twice.

## The five error sources

An uncaught throw inside a worker is invisible to the page, which is the
worst failure mode this architecture introduces. Every `error` message
therefore says where it came from, and the five cases have genuinely
different consequences.

| `source`   | What threw                                                | What it cost                                                                             |
| ---------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `message`  | Handling a message from the shell                         | That input or resize was dropped; the app is otherwise intact                            |
| `uncaught` | Nothing caught it, which is almost always a frame         | The dirty set for that frame was already drained, so the surface can be stale            |
| `renderer` | The backend refused to draw: a lost device, a bad surface | Nothing; layout and state are fine                                                       |
| `channel`  | A channel's worker or its patch stream                    | The view is intact and the data behind it stopped                                        |
| `listener` | One of the application's own event listeners              | Only whatever that handler was going to do; the event still reached the rest of the tree |

[Errors and the overlay](/structure/errors-and-the-overlay) is the same
five sources from the application's side, with what to do about each.

## The single-thread configuration

`GessoApp` speaks none of this. It builds the same runtime on the main
thread, performs a shell request directly instead of posting it, and
uses `requestAnimationFrame` where the worker configuration forwards a
`tick`. A component cannot tell which of the two it is in, which is why
the protocol can stay this small: it carries the difference, and nothing
above it has to.

## Limits

- Everything on this page is read from the two modules that implement
  it, `WorkerApp.ts` and `renderRoot.ts`, and from the specs beside
  them. It has been exercised in Chrome and in Chromium browsers, and in
  nothing else.
- The protocol has no version field and no handshake beyond `ready`. The
  optional fields above are the whole of its compatibility story, and
  they only help in one direction: an older shell against a newer
  worker.
- There is no acknowledgement on any request. `clipboard`, `openUrl` and
  `history` go out and nothing comes back, so an application cannot find
  out whether the clipboard write succeeded.
- A page with no example: the protocol has no visual behaviour of its
  own to show. What it carries is demonstrated on the pages that own
  each subject, and the thread split it exists for is running on the
  [workers](/guide/workers) page.

## Next

[Workers](/guide/workers): the same boundary from the application's
side, with what the shell still owns and which habits stop working once
a component cannot see the page it is drawn on.

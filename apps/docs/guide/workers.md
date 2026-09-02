---
description: What runs in the render worker, what the main thread still owns, and how to move an application across that line.
---

# Workers

The worker configuration is the one to build on, and it is two files
rather than one: [installation](/guide/installation) sets those up. This
page is about what happens after that. Where your code ends up, what the
main thread is still doing on its behalf, and which habits stop working
once a component can no longer see the page it is drawn on.

## What runs where

| Thread                 | Owns                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell** (main)       | The `<canvas>` element, input forwarding, the hidden textarea an IME types into, the off-screen DOM a screen reader reads, resize and device pixel ratio, the display's refresh, the url |
| **Render worker**      | Components, cells, the retained node graph, layout, hit-testing, focus, gestures, text measurement, paint, and the runtime services                                                      |
| **Application worker** | Your api, persistence, domain model and view models, published as channels                                                                                                               |

Everything you write as a component runs in the render worker. So does
every layout pass and every draw call, so a long task on the main thread
cannot make a frame late; that is the whole of the arrangement's
argument.

The shell is deliberately as small as it can be. It forwards raw
coordinates and does not know what they hit: hit-testing, focus and
gesture recognition all happen in the worker, on the tree that is there.
What is left on the main thread is what genuinely cannot run anywhere
else, and the list is short enough to read in full further down.

The application worker is optional and separate. The shell spawns it,
creates one `MessageChannel` between it and the render worker, and then
holds neither end, so a patch from a view model never crosses the main
thread. State and channels are their own subject; what matters here is
that the data path does not pass through the thread this design exists
to keep out of the way.

## What the split buys

The same component, twice. On the left it is in a render worker; on the
right it is mounted with `mountSync`, so it runs where this page's
JavaScript runs. Block the main thread and watch which one keeps its
frame:

<ThreadDemo />

Each canvas times itself and draws its own worst frame gap, because a
reading that had to cross to the main thread could not be trusted while
the main thread is the thing being blocked.

Three measurements behind that, all taken in Chrome:

- **The main thread blocked for 2000 ms.** The worker route's worst
  frame gap was 101 ms; the same application on the single-thread route
  went to 2098 ms, which is the block itself.
- **The shell busy-looped for 5000 ms, with a click delivered during
  it.** The render worker reported the click as 2818 ms late, and its
  worst frame gap stayed at 105 ms against a 106 ms baseline taken
  before the block. A blocked shell costs input latency and nothing
  else: the person waits, and the frame clock never notices.
- **A 1500 ms burn inside a data worker.** The render thread's worst
  frame gap stayed at 106 ms.

Read those as differences, not as frame times. Frames here are
demand-driven, so a screen with nothing to redraw leaves gaps of its own
and a baseline of 106 ms is a screen that was idle, not a screen that
was struggling. The claim is that the number does not move when another
thread is buried.

The input latency in the second measurement is the honest cost. Nothing
about this arrangement makes a blocked main thread harmless; it makes it
stop being a rendering problem and start being a routing delay, which is
why heavy work belongs in a worker of its own rather than on the shell.

## Moving an app in

A component class cannot cross `postMessage`, so the root has to be
named inside the worker that renders it. That single constraint is why
an application has three files rather than two, and it is the only part
of the move that is not mechanical.

```ts
// main.ts: the whole of the main thread's own code
createApp({
  renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' }),
  appLogicWorker: () => new Worker(new URL('./app.logic.worker.ts', import.meta.url), { type: 'module' })
}).mount('#app');
```

```ts
// app.render.worker.ts: everything the person sees
renderRoot(App).useChannel(Catalog).useService(Selection).useRoutes({ routes: ROUTES });
```

Both worker constructors are written out literally because a bundler
only emits a chunk for a worker it can see constructed; a URL held in a
variable produces no chunk. `renderRoot` returns the application, and
everything registered on it is registered inside the worker:

| Call                | For                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `useChannel(token)` | A channel, served by the application worker the shell spawned, or by a worker or source named here         |
| `useService(Class)` | A runtime service: a plain class this thread constructs once and hands to whatever injects it              |
| `useRoutes(routes)` | The routing table, which holds component classes and so could never have been given to the shell           |
| `reload(root)`      | A new root, for hot module replacement; the channels, the services and their state survive the replacement |

The shell side takes options rather than registrations, because it has
nothing of yours to hold: `renderer` chooses the backend, `onFrame` and
`onError` are where metrics and worker exceptions arrive, `onInspect`
feeds the node inspector, `colorScheme` overrides the platform's
appearance for a host with its own control, `history` says how the url
is kept, and `accessibility` can switch off the off-screen mirror for a
measurement. [Devtools](/tooling/devtools) shows those callbacks wired
to something that uses them.

An error thrown inside a worker is invisible to the page by default, so
`onError` is the option to pass first. The worker reports what it caught
while handling a message, what a frame threw, what the renderer refused
and what a channel rejected, with a `source` saying which.

## What the shell still owns

Everything on the canvas below runs in a render worker, and three of the
things it does needed the main thread to do them:

<LiveExample id="workers" height="320" />

<<< @/src/examples/WorkersExample.tsx#shell

The line above the field is `typeof document`, evaluated once where the
component was built. A component that reached for the page would not
fail at some awkward later moment; it would fail there.

That leaves the shell with this, and nothing else:

| The shell does                                    | Because                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Creates the canvas and transfers it               | An `OffscreenCanvas` has to come from an element, and only the page has elements              |
| Forwards pointer, wheel and key events            | The listeners are on a DOM element; every event is stamped with the browser's own `timeStamp` |
| Holds a hidden textarea                           | Composition, dead keys and a soft keyboard are a DOM input's, and the caret is in the worker  |
| Mirrors the semantics tree into off-screen DOM    | The platform's accessibility layer reads elements, and a canvas is one element                |
| Observes the host's size and the pixel ratio      | `ResizeObserver` and `devicePixelRatio` are the window's                                      |
| Runs `requestAnimationFrame` and forwards ticks   | A worker has no frame callback tied to the compositor, so the display's refresh is passed on  |
| Watches `prefers-color-scheme` and reduced motion | A media query needs a window; each is reported once at start and again on every change        |
| Sets the cursor and `touch-action` on the canvas  | The worker decides what the pointer is over; only the DOM can show it                         |
| Writes the clipboard and opens urls               | `ShellService` requests them, and the request is answered on the thread that can perform it   |
| Reports the url and performs history moves        | The address bar is the window's; the routes never leave the worker                            |

Two defaults are cancelled by the shell without asking, because the
worker's answer could not come back in time to cancel anything: Tab,
which would move focus out of the canvas, and Ctrl/Cmd+A, which would
select the page around an application selecting its own text. The wheel
is decided from what the worker last reported about the scroll chain
under the pointer, which is a bet that can swallow one notch at a
container's edge, and it is the reason a canvas does not simply eat
every scroll.

## What changes for you

**There is no DOM.** No `document`, no `window`, no `localStorage`, and
no library that reaches for one. A component that needs something from
the page asks the shell for it, the way the copy button does above.
This is worth knowing before you pick a dependency, not after.

**Only plain data crosses.** Primitives, arrays and plain objects.
A `Date`, a `Map`, a class instance or a domain object compares by
reference across the barrier, which reports "changed" every time it is
evaluated, so view models flatten to plain shapes before they publish.
Nothing else ever crosses at all: elements, components, observables and
nodes are built in the render worker and stay there.

**State goes where its lifetime is.** A value one component owns is
`internalState`. A value a subtree needs is a prop, or an environment
key for something that changes rarely. View state the whole render
thread shares is a runtime service, registered with `useService`.
Anything that survives a reload, or that another screen cares about, is
a channel and lives in the application worker. [State and
services](/guide/state-and-services) walks that ladder rung by rung. The
rule to hold onto is that a hover highlight must never round-trip to
another thread.

**Fonts are the page's, not the worker's.** A family is a string handed
to the renderer, and nothing in these packages loads a font. The
examples on this site ask for system families for that reason. A custom
face in the worker configuration is untested here, so treat it as
something to verify in your own project rather than as something that
works.

## When one thread is the right answer

`mountSync` mounts the identical tree on the calling thread, and both
configurations run the same runtime, so a screen written for one runs
unchanged on the other:

```ts
createApp(App).mountSync('#app');
```

Reach for it in tests, in headless rendering, and where
`OffscreenCanvas` is not available. It is not the default for an
interactive application, because everything the framework does is then
competing with everything else on the main thread, which is what the
right-hand canvas above is demonstrating. Mounting the worker
configuration without `OffscreenCanvas` throws, and the message names
`mountSync` as the way out.

## Limits

**Where this was checked.** Every number on this page was measured in
Chrome, on the playground's own routes, by blocking a thread on purpose
and reading what each thread said about itself. No other browser has run
any of it, and the desktop webviews the framework is aimed at, WKWebView
and WebView2, have not been measured at all.

**A 5000 ms busy loop is a mechanism, not a magnitude.** It proves that
a blocked shell costs latency rather than frames. What a real
application layer costs the thread it runs on is a different question,
and it is the one that would decide where to put yours.

**The example above is checked without a browser.** Its spec mounts the
same component with `@gesso/testing`, in a runtime with no DOM, and
asserts the four claims the page makes about it: that the component runs
where there is no `document`, that typed text reaches it through the
editing path a shell forwards on, that the copy button issues a
clipboard request instead of performing one, and that the appearance
line follows what the shell reported. What a spec cannot check is the
paint, and this canvas was not watched in a browser while the page was
written, so treat it as the least verified thing here.

## Next

[Devtools](/tooling/devtools) is how you see into a worker at all: an
error overlay that draws a worker's exceptions where the application is,
a node inspector, and a frame profiler fed by the metrics the worker
reports.

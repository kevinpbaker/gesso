---
description: Where an exception in application code is caught, what it costs the running app, and how a failure inside a render worker reaches the page at all.
---

# Errors and the overlay

A Gesso application hides its failures twice over. There is no DOM to go
red, so nothing stops laying out and the last good frame stays on the
canvas, which looks exactly like a working application. And the
interface runs in a worker whose console belongs to a thread the page
cannot read, so the report that does exist lands somewhere a person only
finds by knowing to go there.

Both of those are addressed by widening what gets reported rather than
by catching more. This page is what gets reported, from where, and what
each kind costs the application that is still running.

## The five sources

Every error the runtime reports carries one of five sources, because
what threw matters less than what is now broken:

| Source     | Where it came from                               | What it cost                                                                 |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `listener` | One of your event handlers threw                 | Whatever the handler was for. The event still reached the rest of the tree.  |
| `uncaught` | Nothing caught it, outside any message           | If it was a frame, that frame's work is gone and the surface can stay stale. |
| `message`  | Handling a message from the shell                | That input or that resize was dropped. The app is otherwise intact.          |
| `renderer` | The backend refused to draw                      | Nothing is painting. Layout and state are fine.                              |
| `channel`  | A command or a view on the far side of a barrier | The view is intact; the data behind it stopped arriving.                     |

They reach the shell through `onError`, which both configurations take,
and whose default implementation prints the source along with the
message. That default is worth knowing about: an application with no
devtools wired still says which of the five it was.

## In an event listener

The most common way an application actually breaks, and the one the
runtime works hardest to keep visible. The dispatcher has to catch a
listener's exception, because one broken `onClick` must not stop the
event reaching the other listeners on the same node or the ancestors
above it:

<<< @/src/examples/ErrorPathsExample.tsx#listener

Caught there, the exception is invisible to everything else, so the
dispatcher hands it to a reporter instead of swallowing it. The report
names the event type and the node, and keeps the original stack. Left
unwired it goes to `console.error`, and in the worker configuration that
console is not the page's, which is how this failure used to disappear
completely.

The spec beside that file is what pins both halves:

<<< @/src/examples/ErrorPathsExample.spec.ts#listener-spec

## During a frame, and outside a message

The runtime is entered two ways, and there is a seam on each.

Anything that throws while the runtime is handling a message from the
shell is caught there and reported as `message`. That covers an input,
a resize, and the very first build of the tree, which happens inside
`init`: a root component whose `render` throws reports as `message`,
because nothing was half-applied.

Everything else needs a listener rather than a `try`, so the render
worker installs `error` and `unhandledrejection` on its own global
scope and reports what they catch as `uncaught`. A frame the clock
paced itself, a callback the animation driver ran, an `async` method on
a service that rejected with nobody awaiting it: none of those has a
message handler above them, and before those two listeners existed they
reached nothing at all.

A frame is the serious case whichever of the two labels it lands under,
and the reason is in the scheduler. It drains the dirty set before
running the frame, so the work that was in progress when the exception
unwound it is gone. Nothing retries the frame and nothing isolates the
subtree, so the surface can stay stale until something dirties those
nodes again.

## In a service or a store

Neither has an error path of its own, because a service is called
rather than scheduled. An exception inside one is attributed to the
seam it unwound through: a click handler makes it a `listener`, a
command handler on the far side of a channel makes it a `channel`, and
an `async` method nobody awaited makes it `uncaught`.

The consequence is worth carrying to a debugging session. The source
names the seam the exception crossed, not the function that wrote it,
so a `listener` report on a screen with one button is usually pointing
at whatever that button called.

## Across a barrier

A channel is served on the thread that owns the data, and a command that
throws there is reported rather than rethrown: a throw would leave the
view waiting for a patch that never comes, with nothing said about why.
The same is true of a view key whose Observable errors, and of a command
name the far side does not declare.

All three arrive as `channel`, prefixed with the channel's name. The
view keeps whatever it last had.

## What still reaches only the console

Two failures do not take any of those routes, and a page that did not
say so would be leaving a reader looking in the wrong place.

**A binding whose Observable errors.** An `error` notification is not an
exception anybody downstream can catch: it terminates the subscription.
The graph logs it, unbinds the property, and the node keeps the last
value that arrived.

<<< @/src/examples/ErrorPathsExample.tsx#binding

<<< @/src/examples/ErrorPathsExample.spec.ts#binding-spec

**A modifier that throws** in `attach`, `update` or `detach` is caught
for the same reason and reported the same way. Letting it out would
leave the tree partly built halfway through reconciling a subtree, with
no way back, so the modifier is detached and the node keeps whatever the
element declared.

Both of these go to `console.error` and not to `onError`, so in the
worker configuration they land in the render worker's console. Both
should reach the overlay and neither does yet. Until they do, a screen
that has quietly stopped updating one value, with nothing reported, is
worth checking the worker's console for.

## Seeing them

`@gesso/devtools` mounts an error overlay over the application: the
message, a sentence saying which of the five sources it came from and
what that costs, the original source line with a caret under the column,
and every stack frame mapped back through the source maps. The node is
named as a path through your own components, `App > TrackScreen >
ActionRow > Button "Like"` rather than an id nothing else will ever
mention.

With [`@gesso/vite-plugin`](/tooling/vite-plugin) in the config there is
no wiring at all: `onError` is connected while the dev server is
running, and the package is fetched the first time something throws.
Mounting it by hand is two lines and is on the
[devtools page](/tooling/devtools);
[reporting errors](/tooling/reporting-errors) is what a shipped build
does instead.

The overlay is worth mounting before any of the other three tools,
because it is the only one that is useful without being switched on.

Alongside it, the browser's own tools still work, as long as you point
them at the right thread. A worker's console output does not appear
under the page: Chrome's console has a context selector listing each
running worker, and the two console-only failures above are visible
only once the render worker is selected there. The debugger lists the
worker separately too, which is where a breakpoint inside a component
goes.

One browser detail the framework handles for you: an uncaught exception
in a dedicated worker is re-reported at the parent's global scope, with
no stack and no source. The shell cancels that copy, because the worker
has already reported the same error over the protocol with both. The one
it lets through is an error that arrives before the worker has ever
answered `ready`, which is how a module that fails to load or to parse
arrives and the only way it arrives at all.

## Why there is no live example on this page

Every other page on this site runs the thing it describes. This one
cannot, honestly. The embed that mounts these examples passes its own
`onError`, and what it does with a report is replace the canvas with the
message, so an example that threw on purpose would tear down its own
canvas and demonstrate the site's error handling rather than the
framework's.

The two components quoted above are real and are checked. They run in
the spec beside them on every test run, without a browser, which is what
this page's claims about the listener seam and the binding seam rest on.
The overlay's own behaviour, the source mapping and the dismissal are
covered by the package's tests and were checked in Chrome in a render
worker.

## What is not caught

- **There is no error boundary.** Nothing isolates a failing subtree or
  substitutes a fallback for it. A component that throws while rendering
  takes its frame with it.
- **The frame that threw is lost**, as above. The overlay says so rather
  than pretending otherwise.
- **Binding and modifier failures do not reach the overlay**, as above.
- **A render worker that fails to load** is reported through the one
  browser error the shell lets through. That path is argued from the
  specification and covered by no test.

## Next

[Devtools](/tooling/devtools): the overlay's wiring, and the three other
tools that answer what a canvas application will not tell you.

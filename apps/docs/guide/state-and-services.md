---
description: 'Where application state lives when a component runs once: a service while it stays on the render thread, a channel once it crosses one.'
---

# State and services

A [cell](/guide/cells-and-bindings) holds what a component owns.
Everything else has to live somewhere a component can reach: the value
two screens share, the value that outlives the screen that made it, the
value something on another thread is authoritative about.

There are two places for it, and one question picks between them.

| What the value is                                    | Where it goes                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| One component's own                                  | `internalState` in the body                                         |
| A component's and its children's                     | The same cell, passed down as a prop                                |
| A whole subtree's, without prop drilling             | An environment value, the way `theme` is provided                   |
| Shared between screens, and never leaving the thread | A **service**: a class the runtime constructs once and hands out    |
| Owned elsewhere, or outliving the screen             | A **channel**: a declared barrier with data on the other side of it |

The last two rows are this page. The test between them is not how
important the value is; it is whether it crosses a thread.

<LiveExample id="state" height="300" />

Two panels, no props between them. Pressing `+` sends a command to the
basket and the summary is redrawn by the patch that comes back.
Clicking a name writes a service, and the summary reads the same
object.

## A service is a class the runtime hands out

Register it once, where the app is created, and inject it wherever it
is wanted:

```ts
renderRoot(AppRoot).useService(Highlight);
```

<<< @/src/examples/StateExample.tsx#service

`internalState` is not tied to a component. It is a `BehaviorSubject`
with a `.value` setter, so a service can hold one and a binding can
read it directly, which is how the runtime's own services expose state.

A component asks for the class and gets the instance:

```ts
const highlight = ctx.inject(Highlight);
```

A class component uses the decorator form instead, which is the same
registry: `@Inject(Highlight) highlight!: Highlight`.

The runtime registers its own services the same way, so `ctx.inject`
reaches overlays, focus, find, media, animation, the router, and
`ShellService` for the clipboard, URLs and the appearance. Injecting a
class nobody registered throws while the component is being built,
naming the class and listing every service that is registered.

### When a plain service is enough

A service is right when all of these hold:

- The value never leaves the render thread.
- Losing it on a reload is correct rather than a bug.
- Nothing outside the running UI is authoritative about it.

Which selection is active, which overlay is open, which panel is
expanded, a draft the reader has not committed: view state. Putting it
in a service costs nothing and reads as an ordinary object.

A change to a service's own code does not survive a hot replacement
either. The instance does, so the value it holds is kept, but its
methods are still the old code.
[Hot module replacement](/tooling/hot-module-replacement) says what to
hand over and what stays stale.

## A channel is the barrier, declared once

When the state crosses a thread, the two sides cannot share an object,
and the thing they share instead is a token: a name, a shape, and the
value every key holds before anything has been sent.

<<< @/src/examples/StateExample.tsx#contract

The module holding it has no implementation in it, which is the point.
Both threads import the token; only one of them imports the code
behind it, so an app's api client, its repository and its domain
models never reach the render worker.

### The side that owns the data

Whatever produces the values is the application's own business. The
framework sees observables of plain data and nothing else:

<<< @/src/examples/StateExample.tsx#app

One Observable per view key, one handler per command, and that object
is the entire seam:

<<< @/src/examples/StateExample.tsx#source

Above that line there is no framework import: plain classes and plain
RxJS, testable with bare vitest. The framework defines the barrier and
has no opinion at all about what is behind it. An api layer, a
repository, a domain model and a view model is one arrangement; a
single subject is another; nothing here can tell the difference.

### The side that reads it

`ctx.channel(token)` returns the replica, which runs none of the
application's logic. It holds the latest value of each view key and
forwards commands:

<<< @/src/examples/StateExample.tsx#read

Every view key is an `InputCell`, exactly like a prop. A component
reads it, binds it, and cannot write it, and it makes no difference to
the component whether the value came from a parent or from across a
barrier. The class form is `@Channel(Basket) basket!: ChannelReplica<BasketView, BasketCommands>`.

To change something, send a command:

<<< @/src/examples/StateExample.tsx#send

### Registering it

Where the data lives is decided at registration, in one place, by the
option passed:

| Registration                      | Where the data lives                           |
| --------------------------------- | ---------------------------------------------- |
| `.useChannel(Basket)`             | The application worker the shell spawned       |
| `.useChannel(Basket, { worker })` | A worker of this channel's own                 |
| `.useChannel(Basket, { source })` | This thread, over a `MessageChannel` to itself |

<<< @/src/examples/StateExampleWorker.ts#register

A `source` registration still crosses a real port, and is diffed,
patched and plain-data checked exactly like a worker's. That is what
makes the choice a one-line change later: the code above never learns
which it got.

The first row needs an application worker to exist. A single-thread app
has none, and so does a worker-hosted app started without
`appLogicWorker`, and a channel registered there with neither a
`worker` nor a `source` throws at startup saying which of the three to
pass.

## What a command costs, and what it does not do

A command is fire and forget. It has at most one argument, that
argument is structured-cloned onto the owning thread, and it returns
nothing. There is no synchronous answer to be had across a thread, so
the effect arrives as a patch on the view keys it changed.

The spec beside this example measures both halves of that. After a
click on `+`, a frame drawn in the same turn still shows the old total,
because the message has not been delivered yet. The new total appears
once the round trip is done. A click on a name, which writes a service,
is on screen in the very next frame.

So a value written and read back in the same handler has to be a cell
or a service. Nothing across a barrier answers that fast, and a command
that looks like it did would be lying about the thread model.

## Limits worth knowing before the first channel

- **Only plain data crosses.** Primitives, arrays and plain objects. A
  `Date`, a `Map`, a `Set` or a class instance compares by reference,
  so it would report a change on every update and rebuild the subtree
  bound to it forever. The first value of each key is checked and the
  channel reports an error naming the key and the path inside it.
  Flatten it in the layer that owns it.
- **Declare keys finely.** A key holding a large array is re-diffed
  whenever it changes. The differ trims a common prefix and suffix, so
  an append or an edit in place stays small, while a re-sort degrades
  to replacing the middle. Two keys that change for different reasons
  are two keys.
- **There is no undefined window, and no implied loading state.** The
  token's initial value is what the screen draws until the first patch,
  so a channel that is still loading says so in its own shape, with a
  `status` key, rather than leaving the view to infer it from an
  absence.
- **A service is per runtime and per thread.** There is exactly one
  instance, it is reachable only from components in that runtime, and
  it goes away with the app. Nothing about it is shared with another
  thread.
- **Channels are registered before the runtime starts.** Registering
  one afterwards throws, and so does asking for a channel that was
  never registered.

This page's example registers its channel with a `source`, so its data
lives in the render worker beside the components, and everything above
was measured in that configuration. The two-worker arrangement changes
the registration line and nothing else in these files, which is a
property of the API rather than something this page measured.

## Next

[The action log](/tooling/the-action-log) records every command and
every patch crossing a channel, which is the fastest way to see the
round trip above as a timeline.

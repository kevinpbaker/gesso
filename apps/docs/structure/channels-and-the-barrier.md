---
description: 'The declared contract between an application and its view: one token, typed commands out, patches in, and a single structural differ.'
---

# Channels and the barrier

[State and services](/guide/state-and-services) is the gentle
introduction: what a channel is for, how to declare one, and how a
component reads it. This page is what is underneath, for when the
answer matters: what crosses, in which direction, in what shape, and
what the framework does and does not decide for you.

The example below is a task list whose data is on the far side of a
channel. The panel on the right is the wire itself: every message that
crosses, as it crosses. Press a task:

<LiveExample id="barrier" height="340" />

`↑` is a command leaving the view. `↓` is a batch of patches arriving
at it. There is no third kind of line, and there is nothing else in
the protocol.

## The framework's whole opinion about your data layer

A channel is a name, a shape, and the value each key holds before
anything has been sent:

<<< @/src/examples/BarrierExample.tsx#contract

That is the contract, and it is all of it. There is no store base
class, no action type, no reducer, no selector, no dependency
injection for data. The framework subscribes to observables of plain
data, diffs them, and ships patches; where those observables came from
is the application's business and nothing here can tell the
difference.

<<< @/src/examples/BarrierExample.tsx#store

An api client, a repository, a domain model and a view model is one
arrangement. A single subject is another. Both satisfy the barrier
identically, and the module above the source has no framework import
in it at all, which is what makes it testable with bare vitest and
what keeps it out of the render worker's bundle.

The token module is the only thing both threads import. It holds names
and shapes and no implementation, so an application's http client, its
storage layer and its domain models never reach the thread that draws.

## Where each half runs

| Thread             | Holds                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Shell (main)       | the canvas, input forwarding, and the platform APIs that exist only there                 |
| Application worker | api, storage, domain models, view models. Plain RxJS, no framework import above `provide` |
| Render worker      | components, layout, input dispatch, rasterization, and the channel replicas               |

The application layer is a worker rather than the main thread for a
specific reason: `FileSystemSyncAccessHandle`, the fast OPFS path and
the one an SQLite-wasm VFS needs, exists only in a dedicated worker.
On the main thread it is not merely refused, it is not defined.

**The patch stream does not go through the shell.** The shell spawns
both workers and hands the render worker a port to the application
worker; from then on the two talk directly. Routing the data path
through the main thread would re-couple it to the thread this
arrangement exists to keep out of the way.

That is measured rather than argued. With the shell busy-looped for
5000 ms in Chrome, a click made during the block reported 1988 ms of
input latency, while the render worker's worst frame gap stayed at
110 ms against an unchanged baseline and a channel fed from the
application worker kept delivering patches throughout. The person
waits for the click; the frames and the data never notice.

## Registering it, and where the data lives

Where a channel's data lives is decided at registration and nowhere
else. The view above it never learns which arrangement it got.

| Registration                     | Where the data lives                           |
| -------------------------------- | ---------------------------------------------- |
| `.useChannel(Tasks)`             | the application worker the shell spawned       |
| `.useChannel(Tasks, { worker })` | a worker of this channel's own                 |
| `.useChannel(Tasks, { source })` | this thread, over a `MessageChannel` to itself |

A `WorkerHandle` shared between registrations puts those channels in
one worker, which is the arrangement the barrier exists for: api,
storage, domain and view models together, one thread, several
channels. A `source` registration still crosses a real port and is
diffed, patched and plain-data checked exactly like a worker's.

In the application worker, one call publishes everything it offers:

```ts
// tasks.worker.ts
import { serveChannels } from '@gesso/framework';
import { Tasks } from './tasks.contract';
import { createTaskStore, taskSource } from './tasks';

serveChannels([{ token: Tasks, source: taskSource(createTaskStore()) }]);
```

Call it synchronously, at the top level of the worker module and
before any `await`, so no handshake is missed. Everything above that
call is the application's own; that function is the entire seam
between it and the view.

## One differ, and what it costs

Each view key is subscribed on the first sync request, so a channel
nobody is watching costs nothing. When a key emits, its new value is
compared against what the other side is known to hold and the
difference is posted as patches.

| Patch    | Says                                                      |
| -------- | --------------------------------------------------------- |
| `set`    | this path now holds this value                            |
| `delete` | this key or index is gone                                 |
| `splice` | this array changed length here, and here is what is in it |

Paths are relative to the key's own root, so a patch is
self-contained: the replica applies it to the value it already holds
and never needs the previous one. Applying shares structure with the
original everywhere the patch did not reach, and nothing is mutated,
because bindings hold on to the values they were given.

The array differ trims a common prefix and a common suffix and then
recurses. It is deliberately not a minimal edit script: append,
prepend, remove one and edit in place all reduce to one small patch,
while a re-sort degrades to replacing the middle. Computing a true
longest-common-subsequence on every change would cost more than it
saves.

So **granularity is the tuning knob**. Declare keys finely: `tasks`
and `remaining` separately, never one `state` object. A key holding a
large array is re-diffed whenever any part of it changes, and two
values that change for different reasons are two keys. In the panel
above, toggling one task posts `set tasks[1].done` and not a resend of
the list, and the derived summary arrives as a batch of its own
because keys are diffed and posted one at a time.

Patches are queued on arrival and applied in the frame's first phase.
A chatty application thread can deliver many between two frames, and
applied on arrival each one would push a value through the bindings
watching it, rebuilding a subtree once per patch when only the last
state is ever drawn. Queued, a burst costs one pass, and a batch
touching one key three times emits once.

## The wire is a port and four messages

| Direction   | Message           | Carries                        |
| ----------- | ----------------- | ------------------------------ |
| view → data | `channel:sync`    | nothing: "send me everything"  |
| view → data | `channel:command` | a command name and one payload |
| data → view | `channel:patch`   | a batch of patches             |
| data → view | `channel:error`   | a message and a stack          |

The replica asks for a sync rather than waiting to be pushed to, so
neither end depends on which finished starting up first, and a
provider answers a client that reattaches by re-sending every key in
full. Commands are fire and forget: at most one argument, structure
cloned onto the owning thread, returning nothing. There is no
synchronous answer to be had across a thread, and the effect comes
back as a patch or not at all.

A `ChannelPort` is `postMessage` plus `onmessage` and nothing else,
which is why anything port-shaped can sit in the middle of one. The
tap in this example relays both directions and writes down what went
past:

<<< @/src/examples/BarrierExample.tsx#tap

That is the seam the devtools stand on, and standing on the wire is
what lets the [action log](/tooling/the-action-log) do the second half
of its job: putting the view back to an earlier step is a patch batch
shaped exactly like the one a reattaching client gets, so nothing
downstream can tell a replay from a resync.

## Only plain data crosses

Primitives, arrays and plain objects. A `Date`, a `Map`, a `Set`, a
class instance or a function compares by reference, which reports
"changed" on every evaluation, so a key holding one would re-emit
forever and dirty the subtree bound to it while looking perfectly
correct.

That failure is invisible in a test and surfaces much later as a vague
slowness, so it is caught instead: the first emission of each key is
checked, once, and a key that cannot cross is reported as a channel
error naming the channel, the key and the path inside it. The
view-model layer is where rich objects become flat data, and this is
what makes that a rule rather than a convention.

## What must not cross

Every channel hop is a message. View state that round-trips to another
thread is a visible lag on work that never needed to leave the thread
that draws, so a hover highlight, a caret, a scroll offset or which
tab is open stays in a cell or a service.

The test is not how important the value is:

| The value                                                 | Where it belongs |
| --------------------------------------------------------- | ---------------- |
| Written by an event handler, dies with the component      | `internalState`  |
| Shared between screens, never leaves the thread           | a service        |
| Authoritative, outlives a screen, or is on another thread | a channel        |

## Limits

- **A command has no completion signal.** It is fire and forget by
  design. A form submit that must disable its button until the write
  lands does it by publishing a `status` key and binding to that.
- **The diffing cost at `DataTable` scale has not been measured.** It
  is real work, and it runs on the thread that owns the data rather
  than the one that draws, which is the point. The magnitude is not a
  number anyone here has taken.
- **This page's example serves its channel from the render worker.**
  Everything above was measured in that configuration, over a real
  `MessageChannel`. Moving the data to an application worker changes
  the registration line and nothing else in these files, which is a
  property of the API rather than something this page measured.

## Next

[The action log](/tooling/the-action-log) is the panel above, done
properly: one timeline across every channel, with the view rewindable
to any step.

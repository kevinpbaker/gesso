---
description: Record every command and patch crossing a channel, and put the view back to what it showed at any step.
---

# The action log

A channel is the barrier between a screen and the state behind it:
typed commands go one way, patches come back the other. Everything an
application does crosses it, which makes it the one place worth
recording.

The log shows a single timeline across every channel it is tapping:

```text
  0ms   ↓ ticker ticks, label
1.0s    ↓ ticker ticks
2.4s    ↑ ticker.step(10)
2.4s    ↓ ticker ticks, label
3.1s    ↑ heavy.compute()
4.6s    ↓ heavy status
```

`↑` is a command with its payload, `↓` is a patch batch with the
projections it touched, and `!` is a channel error. Click any step and
the view goes back to what it showed then.

## The recorder is a port

`ChannelPort` is `postMessage` plus `onmessage`, so a recorder can
simply be one, sitting between a replica and the channel it talks to:

```ts
const actions = createActionLog();
const panel = mountActionLogPanel(host, actions);

// The recorder wraps the handle, so every channel opened on that
// worker is recorded. The tokens are read for one thing: the value
// both ends start from, since the first patch a provider sends is a
// diff against the token's initial.
const dataWorker = actions.tap(
  workerHandle(() => new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' })),
  [Notes, Settings]
);

const app = createApp(AppRoot).useChannel(Notes, { worker: dataWorker }).useChannel(Settings, { worker: dataWorker });
```

A channel served from this thread rather than from a worker is tapped
with `tapPort` instead. Registering a `source` directly gives you no
port to tap, so serve it over a `MessageChannel` of your own and
register the tapped end.

Standing on the wire rather than hooking a callback is what makes the
second half work. A callback could only watch, and going back to a step
is a write: from a port, a jump is a patch batch shaped exactly like
the one a channel sends when a client reconnects, so nothing downstream
can tell a replay from a resync and the replica's own frame-aligned
batching is used rather than bypassed.

## What time travel actually does

**It rewrites what the view holds. It does not rewind your store.**

The authoritative state is in a data worker, and that worker never
learns you went back. Jumping to an earlier step replays the patches
that produced the view at that moment, so the screen shows what it
showed then; the state behind the barrier has carried on. Press Live
and the view catches up to it.

Two consequences, both deliberate:

- **Patches that arrive while you are pinned are recorded and held.** A
  view that snapped forward on the next tick would be useless for
  reading.
- **A command you send while pinned is still forwarded.** The
  application is not frozen, and swallowing the command would be a
  second untruth on top of the first.

This is worth being clear-eyed about. It is a tool for answering "what
did the screen look like when that happened", not an undo, and it
cannot be made into one from this side of the barrier.

The log is bounded, and a retired entry's patches are folded into a
per-channel base state before it is dropped, so an old step still
reconstructs exactly rather than approximately.

## What it is good at

Reading a sequence. One press producing three patch batches instead of
one is invisible on screen, because the last batch is correct and they
all land in the same frame; it is the first thing you see in the log.
That is how the playground's own "burn 1.5 seconds" button was found to
be publishing two intermediate states that the work was never in.

## The worker configuration

In the worker configuration the ports are created inside the render
worker, where the replicas are, so a panel on the shell has neither end
of them. Tapping it means creating the recorder in the worker, and the
panel is DOM and cannot live there.

The alternative would be to relay every port through the main thread so
the shell could see them, and that is not on offer: it would route
every patch through the one thread the architecture exists to keep
free, on exactly the applications that care most.

So today the panel is for the single-thread configuration and for
channels you tap yourself. `createActionLog()` has no DOM import and
does run in a worker, which is the half of the problem that is solved.

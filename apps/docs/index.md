---
description: A UI framework that runs your whole interface off the main thread, so heavy work and smooth frames stop competing.
---

# Your work and your interface, on different threads

A web page runs everything on one thread of execution. Your parsing,
your diffing, your simulation, your layout and your paint all take
turns on the same one — so whichever is running is the reason the other
is late, and what a person sees is lag.

Gesso puts the entire interface somewhere else. Components, layout,
paint, input and text run in a render worker; your application logic
runs in a worker of its own; the main thread is left holding a canvas
and an event listener.

**Below are two copies of the same component.** The left one is in a
render worker. The right one is the identical code mounted on the main
thread. Block the main thread for two seconds and watch which one
notices — each canvas reports its own worst gap between two frames,
which is the only honest measure across a thread boundary.

<ThreadDemo />

Each canvas draws its own reading: the label, the frame gap and the
caption underneath are all painted by the component itself, on the
thread it is running on, because a number that had to cross to the main
thread could not be trusted while the main thread is the thing being
blocked.

The main-thread copy stops dead for the whole three seconds. The worker
keeps drawing — it hiccups once as it notices the refreshes have stopped
arriving, because nothing inside a worker can see a refresh that did not
happen until the moment it was due.

It is not a trick of the demo. The same shape shows up in the
repository's own measurements:

| What was blocked, and for how long       | Worst frame gap in the render worker        |
| ---------------------------------------- | ------------------------------------------- |
| The main thread, 2,000 ms                | **101 ms**                                  |
| The main thread, 5,000 ms                | **105 ms** (against a 106 ms idle baseline) |
| An application worker, 1,500 ms          | **106 ms**                                  |
| _The same app single-threaded, 2,000 ms_ | _2,098 ms_                                  |

What a blocked thread still costs is the latency of anything that has to
cross it: a click delivered during that five-second block took 2,818 ms
to arrive, on a screen that never stopped animating.

## What writing it looks like

A component function runs **once**. What it returns is a tree of nodes
that stays, and anything that changes is an Observable bound into it —
so there is no re-render pass, no virtual DOM, no dependency array and
no memo.

<LiveExample id="counter" height="180" />

<<< @/src/examples/CounterExample.tsx

Nothing in that file names a colour, because `primary` is a theme token
resolved at paint. Nothing in it re-runs when the count changes: one
property on one node is written, and the next frame is drawn from it.

## What you get

- **A real layout engine.** Flex and grid with CSS's own semantics,
  typed lengths, and text that wraps, clamps and aligns on a baseline —
  checked against Chrome on a few hundred generated fixtures.
- **A component library.** Twenty-seven components that are themed,
  keyboard operable, and announce themselves to assistive technology.
- **Testing without a browser.** `renderTest` queries the same semantics
  tree a screen reader reads, so a test finds a control by asking for a
  control.
- **Two renderers.** Canvas2D by default, WebGPU where it is available,
  drawing from one contract.

## What it is not

It is not for documents. Articles, marketing pages and anything whose
value is being indexed belong in HTML — a canvas has nothing for a
crawler to read, and that is not a gap this project intends to close.
Native form controls bring autofill, password managers and mobile
keyboards that a canvas cannot match.

[What Gesso is](/guide/what-is-gesso) goes through that boundary
honestly, including what has and has not been proven, and where.

## Start

[Installation](/guide/installation) is a running project in about five
minutes — it also says how a project consumes the packages today, which
is not yet from a registry. [Your first component](/guide/counter) is
the ten minutes after that.

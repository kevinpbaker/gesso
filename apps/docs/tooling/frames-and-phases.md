---
description: The seven phases of a Gesso frame, and reading the profiler strip that shows where they went.
---

# Frames and phases

A Gesso frame runs seven phases, in this order, and every one of them
reports what it cost:

| Phase         | What runs                                                            |
| ------------- | -------------------------------------------------------------------- |
| `ticks`       | Active animations advance                                            |
| `patches`     | Channel replicas apply what arrived from a data worker               |
| `environment` | Scoped values that changed are propagated                            |
| `virtualize`  | Lazy windows decide which rows are mounted                           |
| `layout`      | Measure and place, from the relayout roots                           |
| `semantics`   | The semantics tree is rebuilt and diffed, when a mirror is listening |
| `render`      | The scene is drawn                                                   |

The first four run before the frame's dirty set is snapshotted; the
last three run against the snapshot.

**A phase reading of zero means that phase never had work to do.** That
is the single most useful thing about the breakdown, and it is why the
numbers are not smoothed: an idle application really does report
`ticks 0.00`, and an application that does not report zero there has an
animation running that nobody asked for.

## The profiler

`mountFrameProfiler(host)`, fed every frame, shown behind a toggle:

```ts
const profiler = mountFrameProfiler(host);
const app = createApp({
  renderWorker: () => new Worker(new URL('./app.worker.ts', import.meta.url), { type: 'module' }),
  onFrame: metrics => profiler.report(metrics)
});
profiler.setVisible(true);
```

It draws a strip of stacked bars, one per frame, over the last three
seconds, with a line across it where the 60 Hz budget is. Three things
are shapes rather than numbers, and this is what the strip is for:

- **A stall.** One 40 ms frame in a hundred disappears into a mean and
  is obvious as a spike.
- **A phase that only wakes sometimes.** `patches` and `environment`
  run on a minority of frames, so a running average reports them idle
  on exactly the frames where they were the whole cost. The legend
  keeps the worst of each phase over the window instead, and drops any
  phase that never ran.
- **A change.** A render that got more expensive when a route changed
  is a step in the strip and nothing at all in an average.

The scale follows the worst frame in view rather than the budget: a
strip of 40 ms frames pinned to a 16.7 ms ceiling is all full-height
bars and no shape. Where the budget line sits is itself the reading.

## The numbers beside it

- `fps` is derived from the gaps between frames, on the timestamps the
  frames carry, not from a clock on the thread the panel runs on.
  Across a worker boundary the messages queue behind a blocked main
  thread and arrive together, so a profiler that timed its own arrivals
  would report the shell's health rather than the application's.
- `gap` is the worst of those gaps, which is the honest measure of a
  stall.
- `input` is the worst input latency: from the moment the shell
  received an event to the moment the frame answering it finished.

`gap` and `input` are a pair worth watching together, because they are
what the thread model is for. Blocking the main thread moves one of
them and not the other: the render worker keeps drawing at its own
cadence while input, which has to come through the shell, waits.

## What it does not do

- **No GPU stage split.** `FrameMetrics.gpu` breaks the WebGPU render
  phase into prepare, upload and encode, and the strip shows `render`
  as one band.
- **No stack sampling.** It tells you which phase, not which function.
  For that, the browser's own profiler is still the tool, and a render
  worker shows up in it as a thread of its own.
- **No history beyond the window.** Nothing is recorded to a file, and
  there is no way to freeze the strip and read one frame out of it.

## Budgets, rather than watching

For anything you want to stay true, assert it. `LayoutEngine.budget.spec`
lays out a 10,502-node tree and asserts counts from `engine.stats`: a
text change deep in the tree measures 3 nodes and places 4, and a
scroll-only frame measures nothing. A number in a strip is a number
somebody has to look at; a number in a spec fails a build.

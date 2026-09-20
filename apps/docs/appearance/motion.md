---
description: 'Tweens, springs and the ticks phase: how a property travels between two values, how a reorder animates itself, and what reduced motion turns all of it into.'
---

# Motion

An animation in Gesso is a value changing over time. It is not a tree
being rebuilt: a component function still runs once, and every movement
on this page writes properties onto nodes that already exist.

Open the card and move a row. Neither control starts an animation:

<LiveExample id="motion" height="360" />

The card's `height` is a bound prop with a `transition` beside it, and
the rows carry a modifier that reads where they were last frame. Take
either away and both still work; they simply jump.

## Four ways to ask for it

| Form                         | Where it lives                | Reach for it when                                                     |
| ---------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `transition` on an element   | A reserved prop, beside `key` | A property already has the right value and you want it to travel      |
| `animateLayout()`            | A modifier from `gesso-core`  | Layout decides where something moves, so nothing can declare it       |
| `animate(cell, to, options)` | `AnimationService`            | A sequence you are driving yourself, and want to know when it is over |
| `spring(cell, to, options)`  | `AnimationService`            | A movement that follows a gesture and has a real velocity             |

`motion()` and `sharedElement()` are two more, and they get pages of
their own: [enter and exit](/appearance/enter-and-exit) and
[shared elements](/appearance/shared-elements).

## `transition` on a property

`transition` names the properties it animates and says how each one
gets from its old value to its new one. A bare number is a duration in
milliseconds; `tween()` and `spring()` build the longer forms.

<<< @/src/examples/MotionExample.tsx#transition

Three rules fall out of where it interposes, which is the same place
the override cascade sits, on the write path for every property:

- **A node's first value is not a change.** The first write lands
  directly, because animating from a value the node never had would
  mean animating from a default nobody asked for.
- **Re-emitting the same target does not restart it.** A spring told
  repeatedly where it is already going would never settle.
- **What cannot be blended is written, and says so once.** Numbers,
  colours and transforms interpolate. A typed length does not, because
  `auto` into `fr(1)` means nothing until layout has resolved both; a
  palette name does not either, because it resolves against a node at
  paint and an animation has a cell rather than a node. Both fall back
  to writing the value with one warning per property, so "my transition
  does nothing" is never silent.

`transition` is not a registered property. Nothing in layout, paint,
input or the environment reads one, so it is reserved beside `key`,
`ref` and `modifiers` rather than registered. Its _keys_ are checked
against the registry, so `transition={ { opacty: 200 } }` throws the way
a misspelled prop does, and fails to compile first.

## Tweens and springs

`AnimationService` is injected the way any service is, and it drives a
_cell_: anything with a `value` getter and setter, which is what
`internalState` gives you.

```ts
const animations = ctx.inject(AnimationService);
const offset = internalState(0);

animations.animate(offset, 240, { duration: 'slow', easing: 'decelerate' });
animations.spring(offset, 240, { spring: 'gentle' });
```

It is a service rather than a free function because the running set has
to be per runtime: a page with two applications on it would otherwise
share one driver, and a disposed runtime's cells would go on ticking.

**One animation per cell.** Starting a second supersedes the first,
which completes without reaching its target. That is what makes a
gesture work, since every retarget while a finger moves is a new
animation on the same cell, and a superseded spring hands its velocity
to its replacement, so a flick that changes direction bends rather than
restarting.

Both return an Observable of the values written. The cell is driven
whether or not anyone subscribes, because driving it is the point, and
the Observable completes when the animation stops driving the cell:
arrived, superseded, or stopped. A caller that needs to know which of
the three reads the cell.

**Springs take numbers only.** A spring integrates a position and a
velocity, and there is no honest velocity for a colour or for a
transform's fields taken together. Two springs on two numbers is what a
layout animation uses, and it is the correct model. The integrator runs
at a fixed 1/240 s sub-step with the remainder carried, so 60 Hz and
30 Hz agree to six decimal places and a spec can assert the values; one
frame may cover at most 64 ms of simulated time, so a stall resumes
rather than jumping.

### The vocabulary

Durations, easings and springs are named the way colours are, because a
library whose components each pick their own 180 or 240 has no feel.

| Duration     |  ms | What it is for                                       |
| ------------ | --: | ---------------------------------------------------- |
| `instant`    |   0 | No motion. What reduced motion turns everything into |
| `fast`       | 120 | A control acknowledging a press                      |
| `normal`     | 200 | The default: something appearing, moving or changing |
| `slow`       | 320 | A panel or a dialog, which travels further           |
| `deliberate` | 500 | A movement meant to be followed by the eye. Rare     |

| Spring   | Stiffness | Damping | Mass |
| -------- | --------: | ------: | ---: |
| `gentle` |       120 |      20 |    1 |
| `snappy` |       220 |      24 |    1 |
| `stiff`  |       400 |      32 |    1 |

Every preset sits a little under critical damping, so a spring settles
with one small overshoot rather than creeping in. The easings are
`linear`, `standard` (the default), `decelerate`, `accelerate` and
`emphasized`, all cubic Bézier curves in CSS's own sense.

This vocabulary is **not** a field on `UiTheme`, and that is deliberate
rather than an omission. A theme value is resolved per node, and an
animation drives a cell, which has no node to resolve against. An
application with a different feel installs its own with
`animations.setMotion(motion)`, which is per runtime, as everything else
in front of the graph is. Per-subtree motion is not supported: see
[themes and the environment](/appearance/themes-and-the-environment) for
what does travel that way.

Two options are worth knowing beyond the timing. `stepMs` samples an
animation no more often than that, so an eight-bladed spinner wakes
eight times a second rather than sixty. `delay` waits before the first
sample without touching the cell, which is where staggering comes from:
`delay: index * 40` is forty milliseconds of offset per row and no
orchestration mechanism at all.

`stepMs` is a **rate, not a gap between samples**, and the difference
is the whole of why a video plays at the speed it was shot at. Frames
arrive on the display's refreshes, so a sample is nearly always served
a little after it was due; measuring the next step from when the last
one was _served_ rounds the period up to a whole refresh and keeps the
rounding. A 24fps clip wants 41.67ms, and on a 60Hz display the
refresh at 33.3ms is too early and the one at 50ms serves it, so the
next step is measured from 50, wants 91.67, and is served at 100. The
period is not 41.67ms but 50ms, which is 20fps: one frame in six
dropped, for ever. Advancing an ideal timeline by exactly `stepMs`
instead lets the served times alternate between 33.3 and 50 and
average out to the rate that was asked for.

A rate that does not divide the refresh cannot have evenly spaced
samples, and no amount of scheduling changes that: 24 frames a second
on a 60Hz display is 33.3ms, 50ms, 33.3ms, which is the same judder
every player has and the reason a rate-matched display exists. What
scheduling decides is whether the average comes out right.

## FLIP on reorder

Nothing declares where a reordered row animates from, because the
layout decides it. `animateLayout()` reads the box the node had last
frame, draws it back there, and springs it home:

<<< @/src/examples/MotionExample.tsx#flip

Two things about it are worth having in mind before you use it.

**It animates a reorder and follows everything else.** A row that
changed places is drawn back where it was and released; a row that
moved because its neighbour grew simply moves with it. The two look
identical to anything watching boxes and want opposite behaviour, so the
modifier absorbs a move only when its parent's child list actually
changed. A window resize is followed rather than animated for the same
reason.

**It has to survive the render to have a previous box.** A modifier
that has just attached has nothing to animate from, so anything that
re-attaches this one on every emission leaves the list jumping instead
of moving. Its arguments are compared by value, and these are plain
options, so writing `animateLayout({ ... })` inside the list keeps the
modifier attached across the emission. What would not survive is an
argument holding a function or a stream built in the render, since those
are compared as the same only when they are the same one. The example
hoists a single value and shares it across the rows, which says the
timing once and saves building it per row.

The offset is written as the transform's **translation**, which is
paint-only: a reordering list marks Paint and the layout engine does not
run for it. `UiTransform.x` and `.y` are the transform's _pivot_ and
move nothing on their own, so the pair to reach for is `translateX` and
`translateY`. Back at rest the modifier clears the override rather than
writing an identity transform, so a settled node has nothing for the
renderer to multiply by.

## The `ticks` phase

Animations advance in `ticks`, the first phase of a frame, before
patches, the environment and virtualization. It is first because
everything after it reads values a tick may have just written: a tick
that changed a width has to be the width this frame's layout places
from.

An idle application schedules **no frames at all**, which is the strong
reading of a profiler that says `ticks 0.00`. An animation's writes
happen inside a frame and the dirty set is drained immediately after,
so nothing an animation does can arm the next frame on its own. The
driver is asked, after each frame, when it next wants one: never, now,
or at a time, which becomes a single timer rather than sixty wake-ups
that decide they are not ready. [Frames and
phases](/tooling/frames-and-phases) is where to read that strip.

## Reduced motion

The preference is a fact about the person rather than about a region of
the tree, so it does not travel in the environment and there is no
scoped value to override. The shell watches
`prefers-reduced-motion: reduce`, reports it once at start-up as well as
on every change, and the render worker receives it as a protocol
message. Nothing in an application arranges any of that.

What it does by default is **snap**: the cell takes its target in the
caller's own turn and the animation never enters the running set, so a
reduced-motion app runs no animation frames rather than running them and
drawing the same thing sixty times. The end state is identical, so a
screen behaves the same and simply stops moving. Turning the preference
on mid-flight finishes what is already running, rather than leaving a
dialog stuck half-faded.

The exception is an animation where the movement _is_ the information.
`reducedMotion: 'keep'` says so, and a spinner and an indeterminate
progress bar are what it is for: one that stopped turning would not be
calmer, it would be saying that work had stopped.

An author who wants to do more than snap reads the preference and
decides not to draw the movement at all:

<<< @/src/examples/MotionExample.tsx#reduced

`applyReducedMotion(reduced)` is public on the same service, because an
application may legitimately offer a motion setting of its own and a
person who wants less motion in _this_ app should not have to change an
operating system preference to get it. The last caller wins; there is no
priority between the platform's answer and the app's.

## What this page was checked against

The spec beside the example mounts it with `gesso-testing`, which needs
no browser, and drives frames on a manual clock. It asserts what a jump
would fail: that the card's `height` and the detail's `opacity` take
values on the way that nothing ever wrote, that arriving takes more than
a frame or two, that a reordered row is drawn back where it was and ends
with no transform at all, and that a row which did not change places is
not animated. Those numbers come from the deterministic test measurer
rather than from a renderer, so they prove which values were written
rather than what the frames looked like. The canvas above has not been
watched frame by frame in a browser for this page, and nothing here was
checked on WebGPU or on a browser engine other than Chromium.

## Next

[Enter and exit](/appearance/enter-and-exit) is what to reach for when
the element is not there yet, or is on its way out.

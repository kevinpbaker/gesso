---
description: 'Presence and motion(): where an element comes in from, what keeps it on screen while it leaves, and the six channels that cost no layout.'
---

# Enter and exit

An entrance is easy: the element is there, and something says where it
started. An exit is the hard half, because by the time you want to
animate it the element has logically gone. `Presence` is the answer,
and the answer is that the node is not kept: the **definition** is.

Swap the notices, then dismiss one:

<LiveExample id="presence" height="320" />

The notice that is on its way out is the same node it always was, still
in the tree, still being drawn. It is dropped afterwards, by the
ordinary removal path, which knows nothing about any of this.

## `motion()`, and the six channels

Both halves are one modifier. A motion state is six numbers and nothing
else:

| Field                       | What it means                                     |
| --------------------------- | ------------------------------------------------- |
| `opacity`                   | Faded to this                                     |
| `x`, `y`                    | Logical pixels right of, and below, where it sits |
| `scale`, `scaleX`, `scaleY` | Scaled, about the element's own centre            |
| `rotate`                    | Radians, about the same centre                    |

Those are exactly the ones that cost no layout: all six resolve as paint
state, so an element moving through them marks Paint and the layout
engine never runs for it. Anything that would move the box, a width or a
margin or a gap, is deliberately not here. It belongs to the layout, and
animating it is what [`transition`](/appearance/motion) is for.

Every field is an offset from rest, and omitting one means "leave it
where it belongs", which is what lets `{ opacity: 0 }` be a complete
description of a fade without also asserting a scale of 1. The presets
are ordinary values:

| Preset                      | Default | What it is                                       |
| --------------------------- | ------- | ------------------------------------------------ |
| `fade`                      |         | `{ opacity: 0 }`                                 |
| `slideUp(distance)`         | 16      | Comes up from below                              |
| `slideDown(distance)`       | 16      | Comes down from above                            |
| `slideFrom(edge, distance)` | 24      | Comes in from `left`, `right`, `top` or `bottom` |
| `scaleFrom(scale)`          | 0.92    | Grows into place                                 |
| `rotateFrom(radians)`       |         | Turns into place                                 |
| `pop(scale)`                | 0.9     | Small and invisible: a dialog or a toast         |

They are named for where an element comes **from**, which is how a
person describes it. Several may be stacked, and `[fade, slideUp(16)]`
is the idiom. A state is plain data, so a component may compute one,
store one or take one as a prop.

`motion({ initial })` is the entrance on its own: the state is applied
without animation when the modifier attaches, which happens during
reconciliation, before the frame lays out or paints. So the element is
never seen at rest first, and it is released on the same frame. That is
the whole difference between an entrance and a jump.

`motion({ state })` is the other use, and it takes an Observable as
readily as a value. `null` means rest, so
`hovered.pipe(map(over => (over ? scaleFrom(0.97) : null)))` needs no
ceremony to say "and back to normal".

## What holds a node while it leaves

`Presence` renders the children it is given, and goes on rendering the
ones it is no longer given until their exit reports that it has
finished:

<<< @/src/examples/PresenceExample.tsx#presence

The children are keyed, and the key is the identity. A different key is
one child leaving and another arriving, so both are on screen for the
length of the transition. A child that comes back before it has finished
leaving keeps its node, and with it its scroll position and its
component's state, rather than being rebuilt from nothing.

| Prop          | Type                   | Default      | What it does                                                 |
| ------------- | ---------------------- | ------------ | ------------------------------------------------------------ |
| `children`    | `UiChild \| UiChild[]` | none         | The keyed children. One that stops appearing is animated out |
| `enter`       | `MotionStateInput`     | none         | Where a child starts. Omitted means it just appears          |
| `exit`        | `MotionStateInput`     | none         | Where a child goes. Omitted means it just goes               |
| `mode`        | `'together' \| 'wait'` | `'together'` | Whether the arriving child waits for the departing one       |
| `timing`      | `MotionTiming`         | none         | One timing serves both directions                            |
| `width`       | `UiLength \| number`   | `100%`       | The container's size                                         |
| `height`      | `UiLength \| number`   | `100%`       | The same                                                     |
| `exitTimeout` | `number`               | `2000`       | A ceiling on how long a child may take to leave              |

`mode: 'wait'` builds the arriving child only once the departing one has
gone, which is right when the two would read as clutter on top of each
other. It is wrong whenever anything is
[shared](/appearance/shared-elements), because a morph is measured off
the element that is still standing there.

`exitTimeout` is insurance rather than policy. An exit that never
settles, a spring given absurd numbers or an element unmounted before it
ever had a frame, would otherwise keep a whole screen mounted for good,
and a leak that looks like a rendering bug is the worst kind.

## Why the definition rather than the node

The obvious implementation is to hold the node inside the reconciler,
and it does not survive contact. A held node has no definition, so every
later reconcile has to be taught to look past it; its id is still in the
graph's index, so the same element returning collides with it; and its
component host must not be released, so the resolver has to learn about
animation. That is three new problems in the part of the system whose
correctness everything else rests on, bought for one feature.

Keeping the definition costs nothing anywhere else. `Presence`
subscribes to a list of children, notices when one stops appearing in
it, and goes on rendering that one as an ordinary child with an ordinary
host. When the exit reports that it is done, it stops, and the ordinary
removal runs, unchanged and unaware that anything unusual happened. The
graph builder is untouched.

## It is a stack, and that decides where to use it

Each child is laid out absolutely inside a positioned container, so a
child on its way out holds no space and the one arriving does not wait
for it. That is exactly what a screen transition, a dialog and a toast
want, and it is exactly the wrong shape for a **row leaving a list**,
where the neighbours have to close the gap behind it.

There is no exit animation for a list row today. What a list wants is
[`animateLayout`](/appearance/motion) on the rows that stay, so the gap
closes as a movement, and the row itself going on the frame it is
removed.

`RouterOutlet` takes an optional `transition` and renders its chain
through `Presence` when it is given one. With none, which is the
default, it renders the chain exactly as before: `Presence` positions
its children absolutely, and an outlet should not change an app's layout
because it decided to add a transition nobody asked for.

## The translation, and the pivot it is not

A motion's `x` and `y` are written as the transform's `translateX` and
`translateY`. `UiTransform.x` and `.y` are the transform's **pivot**,
not a translation: both renderers compose
`T(translate) · T(pivot) · R · S · T(-pivot)`, so `{ x: 50, y: 50 }`
alone moves nothing at all. The translation sits outside the pivot,
exactly where CSS's own `translate` sits relative to
`transform-origin`.

The composer measures the pivot at the node's centre, which is what
makes `scaleFrom(0.9)` grow from the middle rather than out of a corner,
and it re-measures when the element resizes. Back at rest the overrides
are cleared rather than written as an identity transform, so a settled
element has nothing for the renderer to multiply by.

Each channel is a cell of its own, so the six are independently
retargetable: an element can finish sliding while its fade is re-aimed.
More than one `motion` on a node is normal, an element entering _and_
morphing from a previous screen being the usual case, and they compose
by the obvious arithmetic: translations and rotations add, scales and
opacities multiply.

## Reduced motion

Both directions honour it. Under a reduced-motion preference an enter
and an exit each write their target at once, so a notice appears and
disappears without moving and `Presence` drops it on the frame after it
is dismissed rather than a fifth of a second later. Nothing else about
the component changes. [Motion](/appearance/motion#reduced-motion) has
the whole of it, including the one case that deliberately keeps moving.

## What this page was checked against

The spec beside the example mounts it with `gesso-testing` and drives
frames on a manual clock. It asserts the claim this page rests on: that
after a dismissal the notice's node is still in the tree, is the same
node rather than a copy, and is being scaled down, that it is gone once
the exit has run, and that a swap holds both notices at once. It also
asserts that the arriving notice is moved by the transform's
translation while the transform's own `x` and `y` sit at half the node's
width and height, which is the pivot being measured at the centre. The
`exitTimeout` path is not exercised, and the canvas above has not been
watched frame by frame in a browser for this page. Nothing here was
checked on WebGPU or on a browser engine other than Chromium.

## Next

[Shared elements](/appearance/shared-elements) is the case where an
element does not enter or leave at all: it continues, from one screen
onto the next.

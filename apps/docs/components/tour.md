---
description: 'Tour: a guided walk through a screen that dims everything but one element and explains it in a card beside it, with its props, how targets are named, and how it behaves in an OverlayScope.'
---

# Tour

A guided walk through a screen, one element at a time. Everything but
the element dims, and a card beside it says what it is, with Back,
Next and a count. Reach for it to introduce a screen the first time a
person sees it, or to show a design's walkthrough as it would run.

<LiveExample id="tour" height="320" />

<<< @/src/examples/TourExample.tsx#tour

## Naming what a step points at

A step points at a `tourTarget()`, given to the element as its `ref`.
It is a cell rather than the element itself because a component runs
before the refs of what it draws are called: the step learns where its
element is once it is drawn, and a step whose element is not drawn yet
waits for it rather than pointing at nothing.

| Step field | What it does                                                                               |
| ---------- | ------------------------------------------------------------------------------------------ |
| `target`   | The element it shows. Without one, the card is centred over a plain dim                    |
| `title`    | The card's heading, and its name for a screen reader                                       |
| `body`     | A sentence or two under the title                                                          |
| `side`     | `'bottom'` (default), `'top'`, `'start'` or `'end'`: the side of the target the card is on |

## Props

| Prop           | Default  | What it does                                                             |
| -------------- | -------- | ------------------------------------------------------------------------ |
| `steps`        | none     | The steps, in order                                                      |
| `step`         | none     | The step shown, from 0, for an application that owns it; `null` hides it |
| `defaultStep`  | `0`      | The step it starts at, for a tour that owns its own                      |
| `onStepChange` | none     | Called with the step it asks for, and `null` when it ends                |
| `padding`      | `8`      | Room between the target and the edge of the lit hole, in pixels          |
| `doneLabel`    | `'Done'` | The last step's button                                                   |

Like every stateful control, it is controlled by `step` and
`onStepChange` together, and owns its own step otherwise: a `<Tour
steps={…} />` with neither is shown from its first step and walks
itself.

## The dim and the hole

The dim is the shadow of a rounded box laid over the target with
`placement: 'over'`, the overlay placement that lays an entry over its
anchor at the anchor's size, grown by the offset. So the hole follows
the target through scrolling and layout, as a tooltip follows its
anchor. Around the hole, boxes reaching past the screen take every
press and wheel, so the page under the dim stays as the tour left it;
the target itself, in the hole, can still be pressed. The card has the
keyboard while it is open: Escape ends the tour, and the arrow keys
step through it.

## Inside an OverlayScope

A tour drawn inside an [`OverlayScope`](/layout/positioning-and-overlays#the-overlay-layer)
dims that scope and nothing else, which is how a design tool plays a
screen with a tour on it: the dim covers the played screen, scaled and
clipped with it, and the tool around it stays usable. On a settled
clock, a design tool's board, the dim and the card are drawn at rest.

## What this page was checked against

`Tour.spec.ts` mounts a tour of three steps and asserts that the hole
is the first target grown by the padding, with the card under it; that
a press on the dim reaches nothing while one in the hole reaches the
target; that Next and Back move the hole and the card, a step with no
target centres its card, and Done ends the tour, reporting each step
asked for; that Escape ends it; and that a `null` step shows nothing.
A layout spec checks that `placement: 'over'` lays a node over its
anchor, grown by the offset. The spec beside the example walks it to
the end and starts it again.

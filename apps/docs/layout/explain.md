---
description: 'engine.explain: the rule that fixed each axis, in sentences, next to a failing assertion and under the pointer.'
---

# Asking the engine why

A box comes out the wrong size and the record says what happened, not
why. The reasons live in four different places: the flex resolution in
the parent, the stretch at placement, the node's own clamp while it was
measured, and the relayout flags decided a frame earlier. `explain`
collects them.

The title in the card below is not there. It is still a node, still in
the tree, still measured, and it is zero pixels wide:

<LiveExample id="explain" height="280" />

<<< @/src/examples/ExplainExample.tsx#vanished

## The answer

`runtime.explain(node)` returns a `LayoutExplanation`, and
`formatExplanation` prints it, one fact per line. Asked about that
title, mounted in the 420 by 260 viewport its spec uses, it says this:

```text
text 'root:0:0:0:1' · 0 × 28 at (330, 79.6)
width  0       flex item of row 'root:0:0:0': base 124.8 from its max-content width; shrank to 0 (flexShrink 1: the items' base sizes exceed the content box of row 'root:0:0:0', so they give up space); its automatic minimum is 0: a scroll container or clipped text has none, so it may shrink to nothing; its content would need 70.2; the extra 70.2 is clipped
height 28      stretched across row 'root:0:0:0': 28; its content would need 31.2; the extra 3.2 is clipped
constraints from row 'root:0:0:0': width 0 (tight) · height 28 (tight)
padding 0 · margin 0 · content box 0 × 28
relayout: not a boundary · content matters to the parent · a change here is laid out from row 'root:0:0:0' (1 level up)
state: measured · placed · position static
```

Read the width line and the bug is over. The title is a flex item; it
wanted 124.8 pixels; the row had nothing left to give it; and the
reason it went all the way to zero rather than stopping somewhere is
that clipped text has no automatic minimum. Press the button in the
example and the badge starts giving up space of its own, so the same
sentence comes back with a number in it instead of a zero.

Those numbers come from the test text measurer, which is deliberate:
they are exact, and the spec beside the example pins this readout line
for line, so a change of wording in the engine has to reach this page.
In a browser the same tree produces the same sentences with real font
metrics in them.

## What is in one

| Field             | What it holds                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `box`             | The border box, in layout-root coordinates, before scrolling                             |
| `content`         | What the content asked for on each axis, before any clamp                                |
| `measured`        | The size the node reported to its parent                                                 |
| `constraints`     | What the parent handed down on the last measurement                                      |
| `effective`       | Those constraints after the node's own width, height, minimum and maximum                |
| `width`, `height` | Per axis: the `decidedBy` rule, and `reasons`, the sentences in the order they ran       |
| `relayout`        | Whether the node is a boundary, and the ancestor a change here is laid out from          |
| `state`           | The dirty flags, the `position`, whether it clips, and whether the last pass measured it |
| `scroll`          | For a scroll container, or a field that scrolls its own text                             |
| `sources`         | Per property, which modifier is writing it and what the element declared                 |

`decidedBy` is the single rule that fixed the measured size on that
axis, so a tool can group or colour by it:

| Rule           | Meaning                                                     |
| -------------- | ----------------------------------------------------------- |
| `viewport`     | The layout root filling bounded constraints                 |
| `explicit`     | The node's own `width` or `height`                          |
| `flex`         | Flexed by a row or column: grew, shrank, or held at a clamp |
| `stretch`      | Stretched across a container's cross axis or a grid area    |
| `inset`        | An absolute node with both edges of the axis set            |
| `parent`       | A tight size from the parent for some other reason          |
| `content`      | What the content needed                                     |
| `min`, `max`   | Content, then raised by a minimum or capped by a maximum    |
| `aspect-ratio` | Derived from the other axis                                 |

A node with no layout record gets a reason instead of an explanation:
it is not under the layout root, or it is a fragment, or it was added
after the last pass.

## It reads; it does not recompute

Everything above is built from the record and the node's properties
after layout has run. Nothing is laid out a second time to answer the
question, which is what makes `explain` safe to call from a hover
handler sixty times a second.

A handful of facts are recorded where the decision was made, because
they cannot be recovered afterwards: the content's intrinsic size
before the node's own clamp, and, for a flex item, the base, the
minimum, the maximum, and whether that minimum was CSS's automatic one
or an explicit one. Everything else is derived on the spot, including
the relayout root, which is the same walk a dirty mark takes without
marking anything.

## In a test

`@gesso/testing` exposes both forms on a mounted tree:

```ts
const ui = renderTest(createComponent(Card, {}));
ui.explain(node); // the LayoutExplanation
ui.explainText(node); // the same, printed
```

The matchers are where it earns its keep. A `toHaveBox` that misses
prints the explanation under the numbers, so the answer is already on
screen when you go looking for it:

```text
Expected 'root:0:0:0:1' to have width 120, but its box is {"x":330,"y":79.6,"width":0,"height":28}.

Why:
text 'root:0:0:0:1' · 0 × 28 at (330, 79.6)
…
```

That is the whole explanation, not a summary of it, and the spec beside
the example asserts as much. Import the matchers to get it:

```ts
import '@gesso/testing/matchers';
```

## Under the pointer

The same text is what the node inspector paints over a running
application, on the frame's own canvas, so it works unchanged inside a
render worker where there is no DOM. Hover a node and the panel shows
the explanation along with what the element declared, what a modifier
is writing over it, and which component rendered it. See
[inspecting a node](/tooling/inspecting-a-node) for the rest of that
report.

Turning the inspector on sets the engine's trace flag, which is what
fills in `state.measuredLastPass`; turning it off clears it, so an
application nobody is inspecting pays nothing for the facility.

## When a modifier is the answer

A modifier can write the property whose value you are asking about,
and a node that says `width 240` while the element says 200 is the most
confusing thing in this system. So the explanation names the writer:
the axis a modifier changed carries it as its last reason, and
`sources` carries every other property the same way. Nothing is
computed for that; the override cascade already records who wrote what,
in the order the element listed them.

## A property the engine does not know

`widht: 200` used to be silent. It was stored on the node and read by
nothing, so the box came out at its content width with no message
anywhere.

Element props are now checked against the property registry as the
graph is built, and an unregistered one throws, naming the closest
registered name when there is one: `widht` suggests `width`, `colour`
suggests `color`, and an adjacent transposition counts as a single
edit. A prop starting with `on` whose value is not a function is
rejected too, where before it was stored and ignored.

The practical consequence is that ad-hoc data cannot be smuggled onto a
node through a prop any more. Register a property definition for it, or
keep it somewhere other than the tree.

## What was checked

`LayoutEngine.explain`'s own specs cover each `decidedBy` rule against
a real tree: the shrink to nothing, the automatic minimum that stops a
text short of it, an explicit size and the clamp applied to it, content
against a raised minimum and a capped maximum, a stretched cross axis
and a grown main axis. The testing library's specs cover the matcher
handing back the explanation, and the inspector's cover the painting.

The spec beside the example on this page pins the printed readout line
for line, the sentences changing when the cause changes, the number the
example draws on its own canvas, and the failure message a missed
`toHaveBox` produces.

## Next

[Inspecting a node](/tooling/inspecting-a-node) is this answer on a
running application, next to everything else a node can be asked.

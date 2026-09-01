---
description: A header that holds at the edge of its scroll container until its own group scrolls away, and what that costs in layout.
---

# Sticky positioning

A sticky node is in flow, exactly where its row or column put it, until
scrolling would carry it past the edge it named. Then it is held there,
and released again when the group it belongs to scrolls away.

It is one property and one inset:

```tsx
<box position="sticky" top={0}>
```

`position` also takes `static` (the default), `relative` and
`absolute`. This page is only about `sticky`, and it assumes
[overflow and scrolling](/layout/overflow-and-scrolling), since a
sticky node with nothing to stick inside it does nothing at all.

## Headers that hold, and then leave

Scroll the list, and watch the group headers hand the top edge to one
another:

<LiveExample id="sticky" height="340" />

<<< @/src/examples/StickyExample.tsx#section

## What it sticks to

**The nearest scroll container above it**, meaning a `<scrollview>` or
any node with `overflow` set to `scroll` or `auto`. Not the window, and
not the page the canvas is embedded in: an application's root is a
scroll container only if you made it one, and a sticky node with no
scroll ancestor above it simply stays in flow.

**At the inset it named.** `top`, `right`, `bottom` and `left` are how
far inside the container's edge the node is held, so `top={0}` means
flush and `top={8}` leaves eight pixels of the content showing above it.
A node that names no inset never sticks, because there is no edge to
hold it at. One inset per axis: with both `top` and `bottom` set, `top`
wins, and `left` wins over `right`. Naming one on each axis is how a
table's corner cell stays put while both the header row and the label
column do.

## What lets it go

**Its parent's box.** A sticky node is never shifted beyond the box of
the element that contains it, so when that element scrolls away the node
goes with it and the next one takes the edge. That is the whole
difference between a sticky header and a fixed one, and it is why each
group's header in the example lives inside the group rather than beside
it:

```tsx
<column>
  <box position="sticky" top={0} />
  <Row />
  <Row />
</column>
```

The `column` is the bound, and the header travels inside it. A sticky
node whose parent _is_ the scroll container is bounded by the scrollable
extent instead, so that one holds at the edge for the whole list.

## It is not a layout change

Sticking is applied after layout, not by it. The node's layout box is
its flow box, unshifted, and the shift is added when the node is
painted and undone when it is hit tested. Three consequences, and they
are the ones that catch people out:

- **Nothing re-measures when a list scrolls.** The offsets are
  recomputed on scroll-only frames, which do no measuring or placing at
  all, so a sticky header costs a translation per frame rather than a
  layout.
- **Geometry read from layout is the flow position.** That is the
  answer a layout animation needs, since a node whose list scrolled has
  not moved. Where the node is _seen_ is a different question, and the
  accessibility mirror is given that one: a screen reader's cursor
  lands on the header where the eye finds it.
- **It is still a real node.** The pointer meets it where it is drawn,
  so a hover, a press and a click land on the header rather than on the
  row passing behind it.

## What it covers

Within one `zIndex`, positioned children paint after their in-flow
siblings, which is CSS's stacking rule and what lets a sticky header
paint over the rows travelling under it. Hit testing walks that order in
reverse, so a press at the container's top edge meets the header rather
than the row behind it. A sibling with a higher `zIndex` still paints
over the header, since the ordering is by `zIndex` first.

A sticky node is also a containing block for absolutely positioned
descendants, as in CSS.

## Everything that scrolls, scrolls it

The offsets are recomputed from the scroll offset the container settled
on, and every way of moving a list writes that same offset: a wheel, a
smoothed notch mid-animation, a scrollbar drag, a finger, and the reveal
that brings a focused row on screen. There is no separate path for a
sticky node to fall out of step with.

## What was checked

The engine's sticky cases were compared against Chrome: the same trees
in a browser, with the same `scrollTop`, agreeing with Gesso's visible
boxes to within a tenth of a pixel, for `top`, `bottom` and `left`
insets and for nested scroll containers. A parity spec runs a scrolled
list with a sticky header through both renderers and compares the draws,
and the same tree was checked by screenshot on the WebGPU worker route
in Chromium. No other browser has been measured.

## Next

Back to [overflow and scrolling](/layout/overflow-and-scrolling) for the
container a sticky node lives in, or on to
[light and dark](/guide/appearance) for where the colours these
examples inherit come from.

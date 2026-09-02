---
description: A list of any length that mounts only the rows in view, what the estimate and the corrections do, and what the window costs per frame.
---

# Virtualization

A `<scrollview>` measures and places every child it has. That is the
right answer for a settings panel and the wrong one for a log: ten
thousand rows means ten thousand nodes, ten thousand measurements, and
a frame that costs whatever the data costs.

A lazy list inverts that. Only the rows in the viewport exist, and the
rest of the list is two spacer boxes.

Scroll the list below, reverse it, and make it longer. None of those
change how much of it there is:

<LiveExample id="virtualization" height="380" />

<<< @/src/examples/VirtualizationExample.tsx#lazy

## What is actually there

`LazyColumn` is a `ScrollView` whose children come from a window. On
any frame the children are:

1. a lead spacer, as tall as the rows above the window,
2. one keyed wrapper per mounted row,
3. a trail spacer, as tall as the rows below it.

At the size this page embeds, that is eleven wrappers and two boxes,
for fifty thousand rows. The spec beside the example pins the exact
window: eight rows fit in the 212 pixels inside the list's padding, and
the overscan band adds three more past the bottom edge.

The wrappers are keyed, so a row that stays in view keeps its node and
its component across a scroll; a row that leaves is released through
the same disposal path any removed child takes. The graph builder
reconciles them like any other observable children, so nothing here is
a special case in the renderer.

`LazyRow` is the same thing along the horizontal axis. `LazyGrid` is
the vertical one with shared column tracks: every mounted row is a
`Grid` with `subgrid: 'columns'`, so its cells line up with a header
that is rendered once and can be made `position: 'sticky'`. Rows and
header have to be items of a single grid, because tracks cannot be
sized across grids that cannot see one another.

## The estimate, and the corrections

Nothing knows how tall a row is until it has been mounted and measured,
so the window starts from `estimatedExtent` and corrects itself:

- Every measured row whose extent differs from the estimate contributes
  one correction entry, kept sorted by index.
- The offset of row _i_ is `i × estimate` plus the corrections before
  _i_, and the first visible row is a binary search over that.
- So a fifty thousand row list costs memory and time proportional to
  the rows somebody has actually looked at, never to the count.

Two consequences follow, and both are the behaviour of every
estimate-based virtualizer.

**The scroll range is an estimate too, and it settles.** The example's
list reports a content height of fifty thousand rows at the estimate
plus its own padding before anything has been scrolled, which is what
gives it a scrollbar at all. Give `estimatedExtent` the height your
rows actually are and there is very little settling to see.

**Dragging a scrollbar far into rows nobody has seen lands on
estimates**, which then correct as those rows are measured. When a
correction changes the size of the content _above_ the first mounted
row, the window reports the difference and the scroll offset is moved
by it, so the row under the reader's eye does not jump. In practice
that only happens scrolling upward into unmeasured territory.

## The count and the revision

Two values the window cannot work out for itself are bound rather than
fixed at construction, and both arrive through the same `lazySource`
modifier the list attaches to its own node.

`count` is how many rows there are. Hand it an Observable and the list
follows: measurements past the new end are dropped, because a shorter
list that kept corrections for rows it no longer has would claim scroll
range that is not there.

`revision` is any value that changes when what an index _means_
changes: a sort, a filter, a page of data arriving. The mounted rows
are rendered again and their measurements forgotten, but the indices
and the keys do not move, so the rows are reconciled in place rather
than rebuilt and the list stays exactly where it was. The example
passes the same cell it reads inside the row renderer, which is the
usual shape.

A modifier rather than a subscription taken inside `LazyColumn`,
because a modifier's lifetime is exactly its node's, and because
modifiers attach after an element's props and before its children are
reconciled: a count that arrives with the tree is already in the window
when the first children are read from it.

## What it costs per frame

The runtime runs a [`virtualize` phase](/tooling/frames-and-phases)
before the frame's dirty set is snapshotted. For every scroll container
carrying a window it reports the container's current scroll offset,
which is the property a wheel has just written rather than last frame's
record, its viewport, and the measured extent of each mounted wrapper.

Because that happens before collection, **rows a scroll reveals are
mounted, laid out and painted on the same frame as the scroll.** The
estimate stands in for their size for that one frame and is corrected
on the next. The phase reports zero when no lazy list exists, so an
application without one pays nothing and the profiler says so.

What is left over is a per-row wrapper node, which is the price of
measuring and keying a row without touching its own props.

## What does not survive

**A row that scrolls out of view is gone.** Its nodes are disposed and
its component is unmounted. The row renderer is called again from
scratch when that index comes back, so anything the row held that has
to outlive it belongs in the application's state, not in the row. This
is true of every virtualized list; it is worth saying because a plain
`<scrollview>` does not behave that way.

**Only the mounted rows are in the semantics tree.** What they say
about the list has to be the whole list even so, and that is what the
`LazyList` component adds on top of this: real `posInSet` and `setSize`
values, so a screen reader is told the list has fifty thousand rows and
not eleven.

## Which one to use

| You have                            | Use                                                      |
| ----------------------------------- | -------------------------------------------------------- |
| A long sequence and your own chrome | `LazyColumn` or `LazyRow`                                |
| A long sequence, selectable, keyed  | [`LazyList`](/components/lazy-list)                      |
| Rows with fields that line up       | [`DataTable`](/components/data-table)                    |
| Nested data                         | [`Tree`](/components/tree)                               |
| Fewer rows than fill two screens    | A plain [`<scrollview>`](/layout/overflow-and-scrolling) |

The engine primitive is the right thing when the list is a piece of
your own layout and you are drawing the rows anyway. The components are
the right thing when it is a control: they carry the roles, the
keyboard and the selection, and they cost you the same window
underneath.

A lazy list is still a scroll container, so everything on
[overflow and scrolling](/layout/overflow-and-scrolling) applies to it:
the wheel, the chaining, the overlay scrollbars and the touch pan.

## What was checked

The window's arithmetic is pinned by the engine's own specs: the
initial window from the estimate, movement with a scroll, stable keys,
no emission without a change, sparse corrections, index lookup after
corrections, anchoring, empty and end-of-list cases, the row axis and
custom keys.

The spec beside the example above asserts what this page claims about
it: that fifty thousand rows mount exactly the eleven wrappers the
viewport and the overscan account for, that the scroll range spans
every row before any of them has been measured, that a wheel twenty
thousand pixels down mounts a different window of the same size with
none of the original rows left in it, that a changed count is followed
into the scroll range, and that reversing the order redraws the mounted
rows without moving the list.

Those numbers come from the test text measurer rather than from a
browser, which is what makes them exact. The row heights in the example
are explicit, so the window is the same size either way; a list whose
rows size themselves from their text would mount a window of a
different size in a browser, since the rows would be a different
height.

## Next

[Asking the engine why](/layout/explain) is what to reach for when a
box, in a lazy list or anywhere else, comes out a size you did not
expect.

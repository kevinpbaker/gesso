---
description: 'A table over a hundred thousand rows: generated data, sortable columns, a sticky header, a chosen row, and what stays mounted while the reader scrolls.'
---

# A table over 100,000 rows

A request log, all hundred thousand of it, in a table that sorts from
its header and keeps one chosen row. It is about forty lines of screen
code, and none of them is about scrolling.

This recipe assumes the data is already in memory as an array. Sorting
here is `compare` over that array, so a set too large to hold is a query
rather than a `rows` prop, and what you pass is the page of it you have.
It also assumes you have read [using components](/guide/using-components);
the props each thing takes are on the [DataTable page](/components/data-table).

<LiveExample id="recipetable" height="360" />

Press a header to sort by it: ascending, then descending, then back to
the order the requests arrived in. Click a row, or tab into the table
and use the arrows, Page Up and Page Down, Home and End. The line under
the table reads whichever request is chosen. Sort again and it still
does, because the choice is a request and not a position.

## The data

<<< @/src/examples/RecipeTableExample.tsx#data

Generated, and generated deterministically. `Math.random` would make the
screen different on every reload and the spec beside this page unable to
name the row a sort puts first; a hash of the index costs the same and
is the same every time.

The array is built once at module scope rather than inside the
component. A component function [runs once](/guide/components-run-once),
so either place would work here, but module scope says what is true: the
data does not belong to this screen.

## The columns

<<< @/src/examples/RecipeTableExample.tsx#columns

The columns are the table's track list, and the track list is fixed for
the life of the table, so they are declared once beside the data rather
than rebuilt on every render.

Three decisions are in that array.

**A column sorts if it has a `compare`, and not otherwise.** A header
with no `compare` takes no click, no focus and no keys, which is the
right answer for a column whose order means nothing.

**`width` is a grid track**, so `fr(1)` on the route column is the
column that takes the space the fixed ones leave. The header and every
row are subgrids of one grid, which is what makes a track a single
decision rather than an agreement between rows.

**No cell names a colour.** `color` is inherited, and the chosen row
sets it to the selection foreground, so a cell that named its own colour
would be the one thing on the row that did not change when the row was
picked.

## The screen

<<< @/src/examples/RecipeTableExample.tsx#table

The chosen row is the application's, held in one `internalState` cell
and passed back to the table as `selectedRow`. That is what lets the
detail line under the table read `REQUESTS[chosen]`: the highlight and
the text are the same number, so they cannot disagree.

It is an index into `rows`, not a position on screen. A selection that
meant "the fourth row visible" would name a different request after
every sort.

The sort is left to the table. Nothing else on this screen writes it, so
there is no sort prop at all; take `sort` and `onSortChange` when
something else has to, such as a saved view or a link that opens the
table already sorted.

`rowHeight` is the height a row really is, not a guess. The window
places rows it has not measured yet at that estimate, so a wrong one
makes the scrollbar visibly settle as the reader travels.

## What is actually mounted

At the size this page embeds it, fourteen rows exist at the top of the
data and seventeen in the middle of it, out of a hundred thousand. The
whole subtree under the table, rows, cells, texts and the two spacer
boxes together, is 148 nodes at rest and 175 after a scroll of twenty
thousand pixels. Those are the numbers the spec beside this page pins.

The rest of the table is two boxes: one as tall as the rows above the
window and one as tall as the rows below. The scroll range is the row
count times `rowHeight`, corrected by the rows that have actually been
measured, which is why the scrollbar is the right size on the first
frame. [Virtualization](/layout/virtualization) is the mechanism, and it
is worth reading before you tune anything here.

Two consequences of that are the reader's, not the framework's.

**A row that scrolls out of view is gone**, and its cells with it.
Anything a row held that has to outlive it belongs in the application's
state. Here nothing does: a cell is a `<text>` of a field.

**Only the mounted rows are in the semantics tree**, but what they
announce is the whole set. A mounted row is row 4,213 of 100,000 and
says so, rather than reporting its place among the fourteen that happen
to exist.

## What it costs

Not measured by this page. The figures recorded in
`decisions/0026-data-tier.md`, sampled from the playground's frame
readout over 40 wheel events at about 40 Hz on a 100,000 row table, are
a median frame of 1.2 ms, a p90 of 1.8 ms and a worst of 2.6 ms, with
the profiler reporting 80 laid-out nodes for the whole page. That was
one machine, in the render worker on WebGPU, and a sampled scroll rather
than a sustained soak.

What those numbers say is the shape rather than the speed: the work per
frame follows the window, not the row count. The measurement to trust
for your own screen is your own, taken from
[frames and phases](/tooling/frames-and-phases).

The sort is the exception. It runs over every row at once, so it is
proportional to the data and not to the window: a hundred thousand
comparisons, once, when the sort changes. The order is memoised in
between, because the renderer asks for it once per mounted row.

## What this page has checked

The spec beside the example drives the real runtime with a fake canvas
and asserts what is claimed above: that a hundred thousand rows mount
fourteen rows and 148 nodes at the top of the data and seventeen rows
and 175 nodes in the middle of it; that the scroll range spans every row
while only the first window of them has been measured; that the header holds its position while the rows
scroll under it; that a press on a header sorts ascending, then
descending, then not at all, and that the fastest and slowest requests
in the data are what arrives at the top; that the arrows, Page Down,
Home and End walk the whole set and scroll to a row that does not exist
yet; and that the chosen request and the detail line stay together
through a sort.

Those numbers come from the test text measurer rather than from a
browser. Row heights in a browser differ, so the exact size of the
window does; that it is a window rather than a hundred thousand rows
does not.

The live example above is Canvas2D unless you asked this site for the
other renderer, and Chrome is the extent of what any of it has been
opened in.

## Next

[DataTable](/components/data-table) has the props, the keyboard map and
the semantics in full. [Virtualization](/layout/virtualization) is what
the table scrolls with, and [Tree](/components/tree) is the same
windowing over data that nests.

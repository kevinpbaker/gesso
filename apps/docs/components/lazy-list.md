---
description: 'A list of any length whose visible rows are the only ones that exist: the window, the estimate, the revision, and a keyboard that walks the whole list.'
---

# LazyList

`LazyList` is a list of any length, of which only the rows in view
exist. A hundred thousand items cost about a dozen nodes, the arrows
walk all hundred thousand of them, and every row says where it really
sits rather than where it sits among the dozen. Reach for it when the
data is a sequence and the sequence is long; when the rows have fields
that should line up in columns, [DataTable](/components/data-table) is
the same windowing with a header, and when the data nests,
[Tree](/components/tree) flattens it first.

The list is a scroll container like any other, so everything on
[overflow and scrolling](/layout/overflow-and-scrolling) applies to it:
the wheel, the chaining, the overlay scrollbars, the touch pan.

<LiveExample id="lazylist" height="330" />

<<< @/src/examples/LazyListExample.tsx#list

The buttons change the data rather than the scroll offset. Newest first
flips what an index means and the mounted rows are drawn again where
they are; the count buttons change how many rows there are, and the list
follows. Click the list and use the arrows, Page Up and Page Down, Home
and End: End chooses row 99,999, which does not exist until the list has
scrolled to it.

## What virtualization means here

The engine underneath is `LazyColumn`, and what it mounts is the rows
in the viewport plus an overscan band on each side. Everything else is
two spacer boxes, one above and one below, whose extents come from
`estimatedItemExtent` per row corrected by the real extent of every row
that has been measured. So:

- **The cost is the window, not the data.** Building the list is the
  same work for twenty five rows and for a hundred thousand.
- **The scrollbar settles toward the truth.** Corrections are sparse,
  one per measured row whose extent differs from the estimate, so a
  good estimate means less adjustment as the reader scrolls. Give
  `estimatedItemExtent` the height your rows actually are.
- **A row that scrolls out of view is gone.** Anything it held that
  must outlive it belongs in the application's state, not in the row.
- **Only mounted rows are in the semantics tree.** What they announce
  about the list, though, is the whole list: see Semantics below.

Two props exist for the two things the window cannot work out for
itself.

`count` is how many rows there are, and it is bound: hand it an
Observable and the list follows it, dropping the measurements of rows
that no longer exist.

`revision` is any value that changes when what an index _means_ changes:
a sort, a filter, a page of data arriving. The mounted rows are
rendered again against the new data and the indices do not move, so the
rows are reconciled in place rather than rebuilt, and the list does not
jump. The example passes the same cell it reads in `item`, which is the
usual shape.

`item` is called once per mounted row, and again for the mounted rows
when `revision` changes. It is a function of the index rather than a
list of children, which is what makes the list lazy: nothing is built
for a row nobody can see.

## Props

| Prop                   | Type                                  | Default   | What it does                                                                            |
| ---------------------- | ------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `count`                | `number`                              | required  | How many rows there are. An Observable when the data changes.                           |
| `item`                 | `(index: number) => UiChild`          | required  | The content of one row. Called once per mount, and again on a new `revision`.           |
| `estimatedItemExtent`  | `number`                              | `28`      | The height the window assumes for a row it has not measured.                            |
| `overscan`             | `number`                              | `3`       | Rows mounted beyond each edge of the viewport.                                          |
| `itemKey`              | `(index: number) => string \| number` | the index | Stable identity per row, so a row keeps its node when the list shifts.                  |
| `revision`             | `unknown`                             | none      | Changes when what an index means changes. The mounted rows are rendered again.          |
| `selectedIndex`        | `number`                              | none      | The chosen row. Supplying it makes the selection controlled.                            |
| `defaultSelectedIndex` | `number`                              | none      | The row to start on. `-1`, meaning nothing chosen, when neither prop is given.          |
| `onSelect`             | `(index: number) => void`             | none      | Called with the index a click or a key chose.                                           |
| `onActivate`           | `(index: number) => void`             | none      | Called on Enter or Space with the chosen index. Nothing happens when nothing is chosen. |
| `label`                | `string`                              | `'List'`  | The list's accessible name.                                                             |
| `ref`                  | `UiNodeRef`                           | none      | Receives the node that is the list, for focusing it or reading where it is scrolled to. |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too. The list needs
a definite size on the scrolling axis, from `height` or from `flex={1}`
inside a parent that has one, for the same reason any scroll container
does.

## Controlled and uncontrolled

```tsx
// The application owns the choice, and the list draws it.
<LazyList count={count} item={item} selectedIndex={chosen} onSelect={next => (chosen.value = next)} />

// The list owns it, and reports it if asked.
<LazyList count={count} item={item} defaultSelectedIndex={0} onSelect={remember} />
```

Which of the two applies is decided once, when the list is built, from
whether `selectedIndex` was supplied; passing both throws an error
naming the component.

A controlled list draws the index it is handed, and `onSelect` is a
request: if nothing writes it back, the highlight does not move. One
thing to know about the controlled form is that writing the index from
the application marks that row chosen and does nothing else. The list
scrolls to a row the keyboard or a click reached, not to one the
application wrote, and the spec beside the example proves it. To put a
particular row on screen from the application, scroll the container the
way [overflow and scrolling](/layout/overflow-and-scrolling) describes.

## Keyboard

The list is one tab stop. Focus lands on the list itself and the focus
ring is drawn on it; the rows are not focusable, and which one is chosen
is said by its own selection colour. Selection follows focus, so there
is no second active row to keep in step, and no roving focus over rows
that may not be mounted. A chosen row out of view is scrolled into view.

| Key          | What it does                           |
| ------------ | -------------------------------------- |
| Down         | The next row                           |
| Up           | The previous row                       |
| Page Down    | Ten rows down                          |
| Page Up      | Ten rows up                            |
| Home         | The first row                          |
| End          | The last row                           |
| Enter, Space | Calls `onActivate` with the chosen row |

A page is ten rows rather than a viewport's worth, because rows are of
unknown height until they are mounted and a viewport's worth of them is
not a number the list can know for the part of the data it has never
seen. Every key clamps: a step past the end is the end, never the start.

A key that is bound is consumed; a key that is not is left for whatever
is listening above, which is what keeps Tab, and an application's own
shortcuts, working while the list has focus.

## Semantics

| What       | Value                                            |
| ---------- | ------------------------------------------------ |
| Role       | `list`, on the node that takes focus and scrolls |
| Name       | `label`                                          |
| Row        | `role="listitem"`, named by the text it draws    |
| Position   | `posInSet`, the row's real index plus one        |
| Size       | `setSize`, the real `count`                      |
| Chosen row | the `selected` state, on that row                |

`posInSet` and `setSize` are the real ones, which is the point. A
mounted row is row 4,213 of 100,000 and says so; reporting its place
among the dozen rows that happen to exist would tell a screen reader
that a list of a hundred thousand rows has twelve, which is the one
thing virtualization must not be allowed to say.

A row carries no `label` of its own, so its accessible name is the text
`item` drew in it. Give a row that draws no text something to be named
by.

## What this page has checked

The behaviour above is asserted by the spec beside the example, which
drives the real runtime with a fake canvas: that a list of a hundred
thousand rows mounts fewer than twenty of them while every one reports
the real count, that a new `revision` redraws the mounted rows in place
without moving the list, that a changed `count` is followed, that every
key in the table above moves the choice and that End scrolls to a row
that did not exist, and that an index the application writes itself does
not scroll.

The example above was also driven by hand in Chrome on Linux: Newest
first redrew the mounted rows where they were, 25 rows shortened the
list and brought the offset back into range with it, and End scrolled to
row 99,999 and chose it. That was Canvas2D, which is what a reader sees
here unless they asked for the other renderer, and Chrome is the extent
of what any of it has been opened in.

The list chooses one row at a time, and it has no scroll offset prop of
its own: what moves it is the reader, or the keyboard through the
choice.

## Next

[DataTable](/components/data-table) is this list with columns and a
sticky header, [Tree](/components/tree) is it with branches, and
[overflow and scrolling](/layout/overflow-and-scrolling) is what all
three scroll with.

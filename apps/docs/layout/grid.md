---
description: Tracks, spans and gaps, what each track size means, and the point at which nesting rows inside columns stops being the right answer.
---

# Grid

A `<grid>` lays its children into the cells of tracks you declare. One
container decides both axes, which is the whole difference from a
`<column>` of `<row>`s: the tracks belong to the grid, so every row of
cells is measured against the same widths instead of each arriving at
its own and hoping they agree.

## One shared track

The table below is two tracks wide. The first is `auto`, so it is as
wide as the widest label in the grid, not the widest label in its own
row. Press the button to lengthen the middle label and watch every
value move, including the two rows that did not change:

<LiveExample id="grid" height="320" />

<<< @/src/examples/GridExample.tsx#table

Three rows of `<row>` could not do that. Each would size its own label
from its own content, and lining them up would mean choosing a width by
hand and revisiting it whenever the copy changed.

## Tracks

`columns` and `rows` take arrays of track sizes. Five things are legal
in one, and each answers a different question:

| Track size           | What the track gets                                                   |
| -------------------- | --------------------------------------------------------------------- |
| `120`                | Exactly 120 px                                                        |
| `percent(25)`        | A quarter of the grid's content box on that axis, when it is definite |
| `auto`               | As much as the largest item in it needs                               |
| `fr(1)`              | A share of what is left once the other tracks have taken theirs       |
| `minmax(100, fr(1))` | A share, but never less than 100 px                                   |

```tsx
import { auto, fr, minmax, percent, repeat } from '@gesso/core';

<grid columns={[auto, fr(1), fr(2)]} rows={[40, auto]} gap={12}>
```

`repeat(count, ...sizes)` builds an array rather than being a value of
its own: `repeat(3, fr(1))` is three equal tracks, and
`repeat(2, 120, fr(1))` repeats the pair, giving four tracks. The count
is an integer you supply.

Two behaviours are worth knowing before you reach for `fr`:

- **`fr` has a floor.** A flexible track is treated as
  `minmax(auto, fr)`, so an item that spans it alone still raises the
  track to its min-content size. An `fr(1)` column never gets narrower
  than the longest word in it, which is usually what you wanted and
  occasionally a surprise. Use `minmax(0, fr(1))` when you genuinely
  want the track to be allowed to go below its content.
- **`fr` needs a definite size to divide.** Given no definite width, the
  grid sizes flexible tracks from the largest share any item demands
  rather than from free space, because there is no free space to share.

## Implicit tracks

Items that run past the tracks you declared get new ones. `autoRows` and
`autoColumns` size them, defaulting to `auto`:

```tsx
<grid columns={[fr(1), fr(1), fr(1)]} autoRows={80} gap={8}>
```

`autoFlow` decides which axis fills first: `'row'` (the default) fills
each row left to right and adds rows at the bottom, `'column'` fills
each column top to bottom and adds columns at the end.

## Placing an item

Auto-placement walks a cursor forward through the cells, so children
land in the order they are written. Any item can opt out and say where
it goes:

| Prop         | On the item                           |
| ------------ | ------------------------------------- |
| `column`     | The 1-based column line it starts at  |
| `row`        | The 1-based row line it starts at     |
| `columnSpan` | How many columns it covers, default 1 |
| `rowSpan`    | How many rows it covers, default 1    |

```tsx
<box column={1} row={2} columnSpan={2} />
```

Lines are 1-based and positive: `column={1}` is the first column, and a
value that is not a positive integer throws and names the property.
Items with both lines given are placed first, then items pinned to one
line, then everything else, so an explicitly placed item claims its
cells before auto-placement starts filling around it.

The cursor only ever moves forward. An item too wide for what is left of
a row starts the next one and leaves the cells it skipped empty, which
is what makes a span shift its neighbours down without either of them
saying anything. The note in the example is a plain `columnSpan={2}` and
needs no container of its own.

## Gaps, alignment and distribution

`gap` sets both axes; `columnGap` and `rowGap` set one each, in pixels.

Two pairs of props do the aligning, and the split is the one that trips
people up:

- **`x` and `y` align an item inside its cell.** Both default to
  `'stretch'`, so an item with no size of its own fills its cell.
  `selfX` and `selfY` override the grid for one item.
- **`justifyContent` and `alignContent` distribute the tracks
  themselves**, in the space left when the grid is larger than its
  tracks: `justifyContent` moves the columns, `alignContent` the rows.
  Both take `'stretch'` (the default), `'start'`, `'center'`, `'end'`,
  `'space-between'`, `'space-around'` and `'space-evenly'`. Stretch
  grows the `auto` tracks into the leftover; the other values leave the
  tracks alone and move them.

```tsx
<grid columns={[120, 120]} justifyContent="center" x="start" y="center">
```

Note that `justifyContent` is a grid property. A `<row>` distributes its
children with `x`, not with `justifyContent`; see
[Flex in full](/layout/flex).

## Nesting one grid in another's tracks

A grid inside a grid normally declares tracks of its own, which puts it
back in the position of guessing. `subgrid="columns"` takes them from
the span it occupies in its parent instead:

```tsx
<grid columns={[auto, fr(1), fr(1)]} gap={8}>
  <grid subgrid="columns" columnSpan={3}>
    <text text="Ada" />
    <text text="Lovelace" />
    <text text="1815" />
  </grid>
</grid>
```

The inner grid's cells contribute to the outer grid's track sizes and
are then laid out in the tracks that result, so a row component can line
up with a header it never sees. Only the column axis is available, and
the reason is in the error you get for anything else: a virtualized
table's parent cannot see the rows that are not mounted, so its row
tracks are not something a row could share. A subgrid that finds itself
somewhere other than inside a grid falls back to its own `columns` and
behaves as an ordinary grid.

One difference from CSS here: a subgrid's own horizontal padding and
margins are not distributed into the parent's tracks.

## When to reach for grid

Grid earns its keep when something has to line up across a boundary that
a single container does not own:

- **Cells aligned down a column across several rows.** The example
  above. This is the case nesting cannot do without hard-coded widths.
- **An item that covers more than one cell.** A header across the full
  width, a hero tile two columns wide, a sidebar spanning three rows.
  In nested rows and columns each of those needs a container invented
  for it.
- **A fixed shape.** A dashboard of twelve tiles, a form of label and
  field pairs, a calendar. The tracks say the shape once, and adding a
  child does not mean adding markup.

A `<row>` or a `<column>` is still the right answer for a single axis
with nothing to align across it: a toolbar, a button pair, a stack of
cards. So is a bag of items that should flow onto as many lines as they
need, which is [`flexWrap`](/layout/flex) rather than a grid, because
the tracks here are the ones you declare.

## What is not here

The grid algorithm is a subset of CSS Grid, and the missing parts have
answers rather than workarounds:

| Not supported            | What to do instead                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Dense packing            | Place the items that would have backfilled, with `column` and `row`                                                      |
| Negative line numbers    | Count from the start: the track list is yours, so its length is known                                                    |
| Named lines and areas    | Use line numbers, or name them yourself as constants beside the track array                                              |
| `repeat(auto-fill, ...)` | Work out the count from the width you have and pass it to `repeat(count, ...)`, or use a wrapping row for a bag of items |
| `subgrid` on rows        | Give the inner grid explicit `rows`                                                                                      |

## What the numbers were checked against

The grid cases in the layout conformance suite are compared box for box
against headless Chrome: fixed, percentage, `auto`, `fr` and `minmax`
tracks, implicit tracks in both flow directions, explicit placement,
spans that wrap onto the next row, alignment inside cells, track
distribution, and margins and padding around it all. Chrome 152
generated the current expectations, and it is the only browser they were
taken from.

Layout does not change with the renderer. Boxes are computed once by the
layout engine and both Canvas2D and WebGPU read the result, so a track
is the same width whichever one is drawing.

## Next

[Flex in full](/layout/flex) is the one-dimensional half, and the one to
read when a screen turns out not to need tracks after all.

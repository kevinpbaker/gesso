---
description: 'A table of any length: columns the rows share with a sticky header, sorting from the header or from the application, and a chosen row that survives a sort.'
---

# DataTable

`DataTable` is rows of data in columns that line up, for a set big
enough that scrolling it matters: a hundred rows or a hundred thousand.
It sorts from its header, keeps one chosen row, and mounts only the
rows in view. Reach for it when the data is a record with fields; when
the rows are one thing each and the columns are not the point,
[LazyList](/components/lazy-list) is the smaller control, and when the
data nests, [Tree](/components/tree) is the shape that flattens.

The table is one grid. The header and every row are subgrids of it, so
a column is one track and nothing has to agree with anything about
where it starts.

<LiveExample id="datatable" height="330" />

<<< @/src/examples/DataTableExample.tsx#table

Press a header to sort by it: ascending, then descending, then back to
the order the data came in. Choose a row and sort again, and the same
person is still chosen, because the choice is an index into `rows`
rather than a position on screen. The two buttons write the same sort
the header writes, which is what a controlled sort is for.

## Props

`DataTable` is the library's one generic component. A JSX tag cannot
carry a type argument through to the props it checks, so name the row
type once with an instantiation expression, as the example does:

```tsx
const RunTable = DataTable<Run>;
```

| Prop                 | Type                                    | Default   | What it does                                                                                        |
| -------------------- | --------------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `columns`            | `readonly DataColumn<T>[]`              | required  | The columns, and the table's track list. Read once, when the table is built.                        |
| `rows`               | `readonly T[]`                          | required  | The data, in its natural order. Sorting orders a view of it and leaves the array alone.             |
| `sort`               | `DataTableSort \| null`                 | none      | The sort, when the application owns it. Supplying it makes the sort controlled.                     |
| `defaultSort`        | `DataTableSort \| null`                 | none      | The sort to start with, for a table that owns its own. Supplying both throws.                       |
| `onSortChange`       | `(sort: DataTableSort \| null) => void` | none      | Called with the sort a header press asks for, including `null` for the third press.                 |
| `selectedRow`        | `number`                                | none      | The chosen row, as its index in `rows`. Supplying it makes the selection controlled.                |
| `defaultSelectedRow` | `number`                                | none      | The row to start on. `-1`, meaning nothing chosen, when neither prop is given.                      |
| `onSelect`           | `(index: number) => void`               | none      | Called with the index in `rows` of the row a click or a key chose.                                  |
| `onActivate`         | `(index: number) => void`               | none      | Called on Enter or Space, with the index of the chosen row. Nothing happens when nothing is chosen. |
| `rowHeight`          | `number`                                | `28`      | The height the window expects of a row it has not measured yet.                                     |
| `columnGap`          | `number`                                | `0`       | Space between the columns, in the header and in every row.                                          |
| `label`              | `string`                                | `'Table'` | The table's accessible name.                                                                        |
| `ref`                | `UiNodeRef`                             | none      | Receives the node that is the table, for focusing it or reading where it is scrolled to.            |

### `DataColumn<T>`

One column, and everything the table knows about it.

| Field     | Type                                 | Default   | What it does                                                                     |
| --------- | ------------------------------------ | --------- | -------------------------------------------------------------------------------- |
| `key`     | `string`                             | required  | The column's identity, and what a `DataTableSort` names.                         |
| `header`  | `string`                             | required  | The header's text, and the column's accessible name.                             |
| `cell`    | `(row: T, index: number) => UiChild` | required  | The content of one cell. `index` is the row's index in `rows`, not its position. |
| `width`   | `UiTrackSize`                        | `fr(1)`   | The track this column takes: pixels, `percent`, `fr`, `auto` or `minmax`.        |
| `compare` | `(a: T, b: T) => number`             | none      | Orders two rows by this column. A column without it cannot be sorted.            |
| `align`   | `'start' \| 'center' \| 'end'`       | `'start'` | Where the cell's content sits in its track, in the header and in every row.      |

### `DataTableSort`

`{ column: string; direction: 'ascending' | 'descending' }`, where
`column` is a `DataColumn`'s `key`. No sort at all is `null` rather
than an absent field, which is why `onSortChange` can report it.

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

Two things are read once rather than bound. `columns` is the table's
track list, and tracks are not something the rows can be asked to
re-agree on between frames, so a later array is not picked up: build a
new table when the columns change. `rowHeight` and `columnGap` are read
the same way. `rows` is bound, so new data does arrive, and so does a
different number of rows.

## Controlled and uncontrolled

There are two values here and each is owned separately:

```tsx
// The application owns the sort and the chosen row.
<RunTable columns={COLUMNS} rows={RUNS} sort={sort} onSortChange={next => (sort.value = next)} />

// The table owns both, and reports them if asked.
<RunTable columns={COLUMNS} rows={RUNS} defaultSort={{ column: 'score', direction: 'descending' }} />
```

Which of the two applies is decided once, when the table is built, from
whether the value prop was supplied. Passing `sort` and `defaultSort`
together throws an error naming the component, and so does `selectedRow`
with `defaultSelectedRow`.

A controlled table draws what it is handed. A header press is a
request: `onSortChange` fires, and if nothing writes the value back
then the arrow does not move and the rows do not reorder. That is also
what lets something other than a header set the sort, which is what the
buttons in the example do.

The chosen row is an index into `rows`, deliberately, rather than a
position in the sorted view. A selection that meant "the fourth row on
screen" would name a different record after every sort.

## Keyboard

The table is one tab stop, and every sortable header is another. Focus
lands on the table itself, the focus ring is drawn on it, and the keys
below move the choice inside it. A chosen row that is scrolled out of
view is scrolled back in, clear of the sticky header.

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
not a number the table can know for the part of the data it has never
seen. Every key clamps: a step past the end is the end, never the start.

On a sortable header, Enter and Space cycle that column's sort, which
is the same cycle a press gives. A key that is bound is consumed; a key
that is not is left for whatever is listening above, which is what keeps
Tab, and an application's own shortcuts, working while the table has
focus.

## Semantics

| What        | Value                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------- |
| Role        | `grid`, on the node that takes focus and scrolls                                             |
| Name        | `label`                                                                                      |
| Header row  | `role="row"`, named `Column headers`                                                         |
| Header cell | `role="columnheader"`, named by the column's `header`                                        |
| Sorted by   | a `description` of `sorted ascending` or `sorted descending`, on that header alone           |
| Row         | `role="row"`, with `posInSet` its place in the sorted order and `setSize` the number of rows |
| Chosen row  | the `selected` state, on that row                                                            |
| Cell        | `role="cell"`                                                                                |

`posInSet` and `setSize` are the real ones. A mounted row is row 4,213
of 100,000 and says so, rather than reporting its place among the dozen
rows that happen to exist, which is the one thing virtualization must
not be allowed to say.

Which way a column is sorted is a `description` rather than a state.
ARIA says it with `aria-sort` and `UiSemantics` has no state for it, so
this is the honest place for it.

## What this page has checked

The behaviour above is asserted by the spec beside the example, which
drives the real runtime with a fake canvas: the sort cycle, the sort
written from a button, the unsortable column that takes no press and no
focus, the chosen row surviving a sort, every key in the table above,
and the scroll that reveals the last row.

The example above was also driven by hand in Chrome on Linux: a press on
the Score header sorted the rows and drew the arrow, a press on a row
chose it, and End scrolled the table to its last row with the header
holding its place. That was Canvas2D, which is what a reader sees here
unless they asked for the other renderer, and Chrome is the extent of
what any of it has been opened in.

The table sorts one column at a time and chooses one row at a time.
Sorting is `compare` over an array in memory, so a data set too large to
hold is a query rather than a `rows` prop.

## Next

[Tree](/components/tree) is the same windowing over data that nests, and
[LazyList](/components/lazy-list) is the plain list underneath both of
them. [Overflow and scrolling](/layout/overflow-and-scrolling) is what
the table scrolls with.

---
description: 'An editable spreadsheet grid of any size: windowed on both axes, a frozen header and frozen columns, an active cell the keyboard walks, and a cell editor that opens in place.'
---

# DataGrid

`DataGrid` is a spreadsheet: rows and columns of values that a person
walks with the keyboard and edits where they sit. It is windowed on both
axes, so a grid of a hundred thousand rows by fifty columns mounts the
few hundred cells in view and nothing else. Reach for it when every row
has the same shape and the cells are values to read and change; when
the rows are records to choose between and sort,
[DataTable](/components/data-table) is the better control.

The grid holds no data. It asks `getValue` for the cells in view and
reports an edit through `onCellChange`, so the five million values a
large sheet stands for stay wherever the application keeps them.

<LiveExample id="datagrid" height="400" />

<<< @/src/examples/DataGridExample.tsx#grid

Click a cell and walk with the arrows, or jump with Ctrl+End to row ten
thousand. Type over a quarter and press Enter: the line under the grid
reports the edit, and the Total beside it changes, because the grid
reads the cells in view again after every commit. The Total itself is
read-only, so Enter, F2 and typing do nothing there. Scroll sideways
and the Item column stays where it is.

## Props

| Prop                 | Type                                                   | Default  | What it does                                                                                    |
| -------------------- | ------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `columns`            | `readonly DataGridColumn[]`                            | required | The columns, and the sheet's geometry. Read once, when the grid is built.                       |
| `rowCount`           | `number`                                               | required | How many rows there are. Bound, so the data may grow and shrink.                                |
| `getValue`           | `(row: number, column: string) => string`              | required | The stored value of one cell. Asked only for the cells in view, so it must be cheap.            |
| `onCellChange`       | `(row: number, column: string, value: string) => void` | none     | A committed edit, or a cell cleared with Delete. The grid reads the cell again straight after.  |
| `revision`           | `unknown`                                              | none     | Change it when the data changes for a reason the grid did not cause, and the cells are re-read. |
| `frozenColumns`      | `number`                                               | `0`      | How many columns at the start stay in view while the rest scroll. Read once.                    |
| `activeCell`         | `DataGridCell`                                         | none     | The active cell, when the application owns it. Supplying it makes it controlled.                |
| `defaultActiveCell`  | `DataGridCell`                                         | none     | The cell to start on, for a grid that owns its own. The first cell when neither is given.       |
| `onActiveCellChange` | `(cell: DataGridCell) => void`                         | none     | Called with the cell a key or a click moved to.                                                 |
| `rowHeight`          | `number`                                               | `28`     | Every row's height. Read once.                                                                  |
| `headerHeight`       | `number`                                               | `32`     | The header row's height. Read once.                                                             |
| `readOnly`           | `boolean`                                              | `false`  | No cell may be edited, whatever its column says. The active cell still moves.                   |
| `disabled`           | `boolean`                                              | `false`  | Takes no focus, no pointer and no key, and dims the text.                                       |
| `label`              | `string`                                               | `'Grid'` | The grid's accessible name.                                                                     |
| `ref`                | `UiNodeRef`                                            | none     | Receives the node that is the grid, for focusing it or reading where it is scrolled to.         |

### `DataGridColumn`

| Field      | Type                           | Default   | What it does                                                                           |
| ---------- | ------------------------------ | --------- | -------------------------------------------------------------------------------------- |
| `key`      | `string`                       | required  | The column's identity: what `getValue`, `onCellChange` and a `DataGridCell` name.      |
| `header`   | `string`                       | required  | The header's text, and the column's accessible name.                                   |
| `width`    | `number`                       | required  | Width in pixels.                                                                       |
| `editable` | `boolean`                      | `false`   | Whether a person may change this column's cells.                                       |
| `align`    | `'start' \| 'center' \| 'end'` | `'start'` | Where the value sits in its cell, in the header and in every row.                      |
| `format`   | `(value: string) => string`    | none      | How a value is drawn and announced. The editor opens on the stored value, not on this. |

### `DataGridCell`

`{ row: number; column: string }`, where `row` is the row's index from
0 and `column` is a `DataGridColumn`'s `key`.

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

A column's width is a number rather than a track. The window on each
axis is arithmetic on the widths, which is what lets the grid know
where column 37 starts without mounting columns 0 to 36; an `fr` track
would have to be sized from the content of cells the grid exists not to
mount.

### When the data changes

The grid reads a cell when it comes into view, and reads every cell in
view again after a commit, a Delete, and any change of `revision`,
`getValue`, `readOnly` or `disabled`. So an application that writes the
edited value back inside `onCellChange` sees it drawn on the same frame,
and one that refuses it sees the old value come back. Data that changes
on its own (a reload, another person's edit) is a new `revision`:

```tsx
<DataGrid columns={COLUMNS} rowCount={rows} getValue={read} revision={version} />
```

## Controlled and uncontrolled

```tsx
// The application owns the active cell.
<DataGrid {...sheet} activeCell={active} onActiveCellChange={cell => (active.value = cell)} />

// The grid owns it, and starts on the third row.
<DataGrid {...sheet} defaultActiveCell={{ row: 2, column: 'name' }} />
```

Passing both throws an error naming the component. A controlled grid
draws what it is handed: an arrow key asks for the next cell through
`onActiveCellChange`, and if nothing writes it back the outline stays
where it is. Writing a cell from outside moves the outline there and
scrolls it into view, however far away it is.

The values are always the application's, whichever way the active cell
is owned.

## Keyboard

The grid is one tab stop. Focus lands on the grid, the focus ring is
drawn around it, and the active cell is outlined inside it. Whatever
moves the active cell, it is scrolled into view, clear of the header
and of any frozen columns.

| Key                 | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| Up, Down            | The cell above or below                                               |
| Left, Right         | The cell beside, mirrored under right to left                         |
| Home, End           | The first or last cell of the row                                     |
| Ctrl+Home, Ctrl+End | The first cell of the grid, or the last; Cmd works as Ctrl does       |
| Page Up, Page Down  | As many rows as the viewport shows                                    |
| Tab, Shift+Tab      | The next or previous cell in the row; off either end, out of the grid |
| Enter, F2           | Edit the active cell, on its current value                            |
| a character         | Edit the active cell, replacing its value with that character         |
| Delete, Backspace   | Clear the active cell                                                 |

While a cell is being edited, the arrows, Home and End move the caret
in the editor rather than the active cell, and three keys close it:

| Key            | What it does                                  |
| -------------- | --------------------------------------------- |
| Enter          | Commit, and move to the cell below            |
| Tab, Shift+Tab | Commit, and move to the next or previous cell |
| Escape         | Put the old value back                        |

A click elsewhere commits as well, as a spreadsheet does. Every key
clamps at the grid's edges rather than wrapping. Tab is the exception
on purpose: off the end of a row it is not consumed, so focus moves on
to the next control. Wrapping to the next row would make a grid of a
hundred thousand rows a trap for anyone using the keyboard to get past
it.

A cell that cannot be edited, in a column without `editable` or in a
`readOnly` grid, refuses Enter, F2, typing and Delete, and leaves those
keys for whatever is listening above. A key the grid does not bind is
left alone the same way.

With the pointer, a click makes a cell active and a double click edits
it.

## Semantics

| What        | Value                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| Role        | `grid`, on the node that takes focus and scrolls                                    |
| Name        | `label`                                                                             |
| Active cell | the grid's `activeDescendant`, and the `selected` state on the cell                 |
| Header row  | `role="row"`, named `Column headers`                                                |
| Header cell | `role="columnheader"`, named by the column's `header`                               |
| Row         | `role="row"`, with `posInSet` its row number and `setSize` the row count            |
| Cell        | `role="gridcell"`, named by its value as drawn                                      |
| Read-only   | the `readonly` state, on every cell that cannot be edited, and on a `readOnly` grid |
| Disabled    | `disabled`, on the grid                                                             |
| Editor      | `role="textbox"`, named by the column's `header`, while a cell is being edited      |

Focus stays on the grid as the active cell moves, and the cell is the
grid's active descendant, so a screen reader reads each one as the
keyboard reaches it. A row's `posInSet` is its place in the whole data:
a mounted row is row 4,213 of 100,000 and says so.

There is no column index on a cell yet. `UiSemantics` has `posInSet`
and `setSize` and nothing like ARIA's `aria-rowindex` and
`aria-colindex`, so a cell's column is known to a screen reader only by
its position among the cells mounted in its row, which after a sideways
scroll is not its column in the data. That is a gap in the semantics
model rather than in this component, and it is listed below.

## What this page has checked

The behaviour above is asserted by two specs that drive the real
runtime with a fake canvas: `DataGrid.spec.ts` beside the component,
and `DataGridExample.spec.ts` beside the example. Between them they
cover every key in both tables, and the arrows, End and a frozen column
under right to left as well;
the click and the double click; the read-only column and the read-only
grid; the controlled and uncontrolled active cell, including one written
from outside a long way off screen; a commit the application refuses;
`revision`; the disabled grid; a frozen column staying put while the
rest scroll, in both directions; and a grid of a hundred thousand rows
by fifty columns mounting fewer than 150 cells and reaching its far
corner.

What they cannot check is the drawing. Nothing on this page has yet
been opened in a browser: the outline, the freeze line, the dimmed text
and the editor in its cell are things these specs do not see.
Scrolling speed has been measured only in the test runtime, where a
scroll of a few rows costs a few milliseconds a frame and a jump that
replaces every mounted row of a 1200 by 800 grid costs about 30; how
that feels in a browser, with a scrollbar being dragged, has not been
tried. No screen reader has been sat in front of it.

Typing a character to start an edit takes the first character from the
key itself. A second character typed before the next frame has put the
editor on screen is lost, and a character that needs an input method
cannot start an edit at all: press Enter or F2 first and compose in the
editor.

Out of scope for this first version, and the obvious next steps:
selecting a range of cells, copy and paste, formulas, resizing a column
by dragging its header, frozen rows below the header, row headers, and
the row and column indices described under Semantics.

## Next

[DataTable](/components/data-table) is rows of records that sort and
choose rather than cells that edit, and
[Overflow and scrolling](/layout/overflow-and-scrolling) is what the
grid scrolls with.

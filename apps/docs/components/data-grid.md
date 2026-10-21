---
description: 'An editable spreadsheet grid of any size: windowed on both axes, a frozen header, frozen rows and columns, row headers, resizable columns, formulas, an active cell the keyboard walks, a range of cells to select, copy and paste, and a cell editor that opens in place.'
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
reports an edit, a cleared cell or a pasted one through `onCellChange`,
so the five million values a large sheet stands for stay wherever the
application keeps them.

<LiveExample id="datagrid" height="400" />

<<< @/src/examples/DataGridExample.tsx#grid

Click a cell and walk with the arrows, or jump with Ctrl+End to row ten
thousand. Type over a quarter and press Enter: the line under the grid
reports the edit, and the Total beside it changes, because the example
moves `revision` on with every change and the grid reads the cells in
view again. The Total itself is read-only, so Enter, F2 and typing do
nothing there. Hold Shift and press the arrows, or drag across the
quarters, to select a range; Ctrl+C copies it as tab-separated text that
a spreadsheet pastes as cells, and Ctrl+V pastes a block from one back
in at the active cell. Scroll sideways and the Item column stays where
it is.

## Props

| Prop                 | Type                                                   | Default  | What it does                                                                                     |
| -------------------- | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `columns`            | `readonly DataGridColumn[]`                            | required | The columns, and the sheet's geometry. Read once, when the grid is built.                        |
| `rowCount`           | `number`                                               | required | How many rows there are. Bound, so the data may grow and shrink.                                 |
| `getValue`           | `(row: number, column: string) => string`              | required | The stored value of one cell. Asked only for the cells in view, so it must be cheap.             |
| `onCellChange`       | `(row: number, column: string, value: string) => void` | none     | A committed edit, a cell cleared or cut, or one value of a paste. The grid reads that cell back. |
| `revision`           | `unknown`                                              | none     | Change it when the data changes for a reason the grid did not cause, and the cells are re-read.  |
| `frozenColumns`      | `number`                                               | `0`      | How many columns at the start stay in view while the rest scroll. Read once.                     |
| `frozenRows`         | `number`                                               | `0`      | How many rows at the top stay below the header while the rest scroll. Read once.                 |
| `rowHeader`          | `boolean \| ((row: number) => string)`                 | `false`  | A column of row headers at the start: `true` numbers the rows, a function names them. Read once. |
| `rowHeaderWidth`     | `number`                                               | `48`     | The row header column's width. Read once.                                                        |
| `columnWidths`       | `Record<string, number>`                               | none     | Column widths by `key`, when the application owns them. Supplying it makes them controlled.      |
| `onColumnResize`     | `(column: string, width: number) => void`              | none     | Called with a column's new width at each step of a drag, a fit, or Alt+Shift and an arrow.       |
| `formulas`           | `boolean`                                              | `false`  | Work out a value that starts with `=` as a formula, and show its result. Read once.              |
| `activeCell`         | `DataGridCell`                                         | none     | The active cell, when the application owns it. Supplying it makes it controlled.                 |
| `defaultActiveCell`  | `DataGridCell`                                         | none     | The cell to start on, for a grid that owns its own. The first cell when neither is given.        |
| `onActiveCellChange` | `(cell: DataGridCell) => void`                         | none     | Called with the cell a key or a click moved to.                                                  |
| `selection`          | `DataGridRange`                                        | none     | The selected range, when the application owns it. Supplying it makes it controlled.              |
| `defaultSelection`   | `DataGridRange`                                        | none     | The range to start with, for a grid that owns its own. The active cell alone when neither.       |
| `onSelectionChange`  | `(range: DataGridRange) => void`                       | none     | Called with the range Shift, a drag, Ctrl+A, Escape or a paste asked for.                        |
| `rowHeight`          | `number`                                               | `28`     | Every row's height. Read once.                                                                   |
| `headerHeight`       | `number`                                               | `32`     | The header row's height. Read once.                                                              |
| `readOnly`           | `boolean`                                              | `false`  | No cell may be edited, whatever its column says. The active cell still moves.                    |
| `disabled`           | `boolean`                                              | `false`  | Takes no focus, no pointer and no key, and dims the text.                                        |
| `label`              | `string`                                               | `'Grid'` | The grid's accessible name.                                                                      |
| `ref`                | `UiNodeRef`                                            | none     | Receives the node that is the grid, for focusing it or reading where it is scrolled to.          |

### `DataGridColumn`

| Field       | Type                           | Default   | What it does                                                                            |
| ----------- | ------------------------------ | --------- | --------------------------------------------------------------------------------------- |
| `key`       | `string`                       | required  | The column's identity: what `getValue`, `onCellChange` and a `DataGridCell` name.       |
| `header`    | `string`                       | required  | The header's text, and the column's accessible name.                                    |
| `width`     | `number`                       | required  | Width in pixels: the starting width, or the fallback for one `columnWidths` leaves out. |
| `minWidth`  | `number`                       | `40`      | The narrowest a person can resize the column to.                                        |
| `resizable` | `boolean`                      | `true`    | Whether a person may resize the column.                                                 |
| `editable`  | `boolean`                      | `false`   | Whether a person may change this column's cells.                                        |
| `align`     | `'start' \| 'center' \| 'end'` | `'start'` | Where the value sits in its cell, in the header and in every row.                       |
| `format`    | `(value: string) => string`    | none      | How a value is drawn and announced. The editor opens on the stored value, not on this.  |

### `DataGridCell`

`{ row: number; column: string }`, where `row` is the row's index from
0 and `column` is a `DataGridColumn`'s `key`.

### `DataGridRange`

`{ from: DataGridCell; to: DataGridCell }`, two opposite corners of a
rectangle of cells. `from` is the corner the range grew from, which is
the active cell whenever a key or the pointer made it, and `to` is the
corner Shift and a drag move. Either may be above or to the right of
the other. Whole rows chosen from their row headers are the exception:
they run from the first column to the last, whichever cell is active.

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

A column's width is a number rather than a track. The window on each
axis is arithmetic on the widths, which is what lets the grid know
where column 37 starts without mounting columns 0 to 36; an `fr` track
would have to be sized from the content of cells the grid exists not to
mount.

### When the data changes

The grid reads a cell when it comes into view, and reads it back after
each `onCellChange` it reports for it: a commit, a cell cleared or cut,
a value pasted. Only that cell, so a paste of a hundred values costs a
hundred reads rather than a hundred screens of them. An application
that writes the value back inside `onCellChange` sees it drawn on the
same frame, and one that refuses it sees the old value come back.

Every cell in view is read again on any change of `revision`,
`getValue`, `readOnly` or `disabled`. Data that changes on its own (a
reload, another person's edit) is a new `revision`, and so is a cell
whose value follows from the one that changed, as a total follows its
parts:

```tsx
<DataGrid
  columns={COLUMNS}
  rowCount={rows}
  getValue={read}
  revision={version}
  onCellChange={(row, column, value) => {
    write(row, column, value);
    version.value += 1;
  }}
/>
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

The selected range works the same way, through `selection`,
`defaultSelection` and `onSelectionChange`, and passing both of those
throws as well. Whatever moves the active cell collapses the range onto
it, so an application that owns the active cell and not the range gets
a range that follows it.

```tsx
// The application owns the range, and shows its size.
<DataGrid {...sheet} selection={range} onSelectionChange={next => (range.value = next)} />
```

The values are always the application's, whichever way the active cell
and the range are owned.

## Keyboard

The grid is one tab stop. Focus lands on the grid, the focus ring is
drawn around it, and the active cell is outlined inside it. Whatever
moves the active cell, it is scrolled into view, clear of the header
and of any frozen columns.

| Key                 | What it does                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| Up, Down            | The cell above or below                                                |
| Left, Right         | The cell beside, mirrored under right to left                          |
| Home, End           | The first or last cell of the row                                      |
| Ctrl+Home, Ctrl+End | The first cell of the grid, or the last; Cmd works as Ctrl does        |
| Alt+Shift+Right     | Widen the active cell's column by 10 pixels; Alt+Shift+Left narrows it |
| Page Up, Page Down  | As many rows as the viewport shows                                     |
| Shift and any above | Stretch the range from the active cell instead of moving it            |
| Ctrl+A              | Select every cell, leaving the active cell where it is                 |
| Escape              | Collapse a range onto the active cell                                  |
| Tab, Shift+Tab      | The next or previous cell in the row; off either end, out of the grid  |
| Enter, F2           | Edit the active cell, on its current value                             |
| a character         | Edit the active cell, replacing its value with that character          |
| Delete, Backspace   | Clear every editable cell in the range                                 |
| Ctrl+C              | Copy the range as tab-separated text, a line per row                   |
| Ctrl+X              | Copy the range, then clear its editable cells                          |
| Ctrl+V              | Paste tab-separated text from the active cell across and down          |

While a cell is being edited, the arrows, Home and End move the caret
in the editor rather than the active cell, and three keys close it:

| Key            | What it does                                  |
| -------------- | --------------------------------------------- |
| Enter          | Commit, and move to the cell below            |
| Tab, Shift+Tab | Commit, and move to the next or previous cell |
| Escape         | Put the old value back                        |

Keys typed in the moment between the one that opens the editor and the
editor taking the keyboard are not lost: typing "Zoe" quickly over a
cell opens it on "Zoe", and an Enter typed in the same moment commits
it.

Home and Ctrl+Home also take the scrolled columns, and with Ctrl the
scrolled rows, back to their start. Without that, Home to a frozen
column would leave the sheet scrolled wherever it was, since a frozen
cell is always in view and revealing it scrolls nothing.

A click elsewhere commits as well, as a spreadsheet does. Every key
clamps at the grid's edges rather than wrapping. Tab is the exception
on purpose: off the end of a row it is not consumed, so focus moves on
to the next control. Wrapping to the next row would make a grid of a
hundred thousand rows a trap for anyone using the keyboard to get past
it.

A cell that cannot be edited, in a column without `editable` or in a
`readOnly` grid, refuses Enter, F2, typing and Delete, and leaves those
keys for whatever is listening above. A key the grid does not bind is
left alone the same way, and so is Escape when there is no range to
collapse.

With the pointer, a click makes a cell active, a double click edits it,
a drag from a cell stretches a range from it, and a Shift+click
stretches the range from the active cell to the cell clicked. A drag
held past the edge of the grid scrolls toward the cell under the
pointer each time the pointer moves. A click on a row header selects
its row, a Shift+click every row from the active cell's to it, and a
click on the corner above the row headers selects everything.

### Copy and paste

A copy takes the stored values, not what `format` draws, so an amount
copied as `1200` pastes as `1200` into another sheet rather than as
`1,200`. A value that holds a tab, a line break or a quote is quoted, as
a spreadsheet quotes it, so it pastes back as one cell. With
`formulas` on, a formula is copied as its result, not its text: see
[Formulas](#formulas). The text goes to
the system clipboard through the shell (`ShellService.copyText`), since
a grid drawn in a render worker has no clipboard of its own.

A paste writes the block from the active cell across and down, one
`onCellChange` per value that differs from what is there. It stops at
the grid's last row and last column rather than adding any, keeps the
value of every read-only cell under it, and selects the block that
landed. A read-only grid takes no paste, and leaves it for whatever is
listening above. A cut is a copy followed by clearing the editable cells
of the range; the read-only ones are copied and kept.

## Resizing columns

Every column can be resized unless it says `resizable: false`. There
are three ways:

- **Drag the edge** at the end of a column's header: the column follows
  the pointer, and the columns after it move along. It stops at the
  column's `minWidth`, 40 pixels unless the column says otherwise.
- **Double-click the edge** to fit the column to its widest value in
  view, or to its header if that is wider. Only the values in view are
  measured, because those are the only ones the grid has: fitting a
  column to a hundred thousand rows would ask `getValue` for all of
  them.
- **Alt+Shift and Left or Right** resizes the active cell's column by 10
  pixels. The grid is one tab stop and its headers take no focus, so
  the active cell says which column. Alt and an arrow alone would be
  shorter, but Alt+Left is Back in a Windows or Linux browser, and a
  grid drawn in a render worker hears the key too late to stop it.
  Ctrl and an arrow switches desktops on a Mac.

Under right to left a column's end edge is its left one, so a drag to
the left widens it, and so does Alt+Shift+Left.

The widths can be left to the grid, which starts from each column's
`width`, or owned by the application through `columnWidths`, a record
of widths by `key`. A controlled grid draws what it is handed: a drag
asks for each new width through `onColumnResize`, and nothing moves
until the record changes. `onColumnResize` is called in either case,
with whole pixels, so an application can remember the widths a person
chose.

```tsx
// The application owns the widths, and caps them.
<DataGrid
  {...sheet}
  columnWidths={widths}
  onColumnResize={(key, width) => (widths.value = { ...widths.value, [key]: Math.min(width, 400) })}
/>
```

A resize builds no cells. Each mounted cell of the column has its width
written, and the sheet moves the columns after it.

## Frozen rows and row headers

`frozenRows` keeps that many rows at the top, below the header, while
the rest scroll up under them, with a heavier line under the last of
them, as `frozenColumns` has after its last column. Revealing a cell
keeps it clear of both, and Page Up and Page Down move by the rows in
view below the frozen ones.

`rowHeader` adds a column of row headers at the start, which stays in
view while the rest scroll sideways, in front of any frozen columns.
`true` numbers the rows from 1, which are also the row numbers a
formula uses; a function names each row itself:

```tsx
<DataGrid {...sheet} rowHeader frozenRows={1} />
<DataGrid {...sheet} rowHeader={row => orders[row].id} rowHeaderWidth={96} />
```

A click on a row header selects the row across every column, and makes
its first cell in view the active one, so the sheet does not scroll
sideways under the click. A Shift+click selects every row from the
active cell's to the one clicked, and the corner above the row headers
selects everything. A row header takes the selection's fill while the
range reaches its row.

## Formulas

With `formulas`, a cell whose stored value starts with `=` is a formula.
The cell shows what it comes to, and the editor opens on the formula
itself, so Enter, F2 and a double click edit `=SUM(B1:B6)` rather than
`7488`. Nothing else changes: the values are still the application's,
read through `getValue` and written through `onCellChange` as the text
a person typed.

```tsx
<DataGrid {...sheet} formulas rowHeader />
```

A reference is a column letter and a row number: `A` is the first
column whatever its `key`, and `1` is the first row, as the row headers
number them. Ranges such as `B1:D6`, the operators `+ - * / ^ &`, the
comparisons and SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR,
NOT, ROUND, ABS, CONCAT, LEN, UPPER and LOWER work as in a spreadsheet.
With formulas on, each column header shows its letter before its name,
and is announced as, for example, "Total, column E".

A formula's result is drawn through the column's `format`, so a total
in a money column has its separators. An error is drawn as its code
(`#DIV/0!`, `#REF!`, `#NAME?`, `#VALUE!`, `#NUM!`, `#CYCLE!`, or
`#ERROR!` for a formula that does not parse) in the theme's danger
colour, unformatted.

After every commit, clear, cut and paste the grid works out every
formula in view again, so a total follows the cell it adds up without
the application moving `revision` on. A value that changes for any
other reason still needs a new `revision`, which works the formulas
out again too. Results are kept between those changes rather than
worked out on every frame: a scroll changes no data.

A copy takes a formula's result, as plain text without the `format`,
and a paste writes what it carries as it comes, a formula included.
Copying the formula itself would paste a reference to the wrong cells,
in another application or two rows down in this one, since nothing
here moves a reference along with its cell.

## Semantics

| What        | Value                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| Role        | `grid`, on the node that takes focus and scrolls                                    |
| Name        | `label`                                                                             |
| Size        | `rowCount` and `columnCount` on the grid: every row and column in the data          |
| Active cell | the grid's `activeDescendant`, and the `selected` state on the cell                 |
| Range       | the `selected` state on every cell in it                                            |
| Header row  | `role="row"`, named `Column headers`, with `rowIndex` 1                             |
| Header cell | `role="columnheader"`, named by the column's `header`, with its `columnIndex`       |
| Row         | `role="row"`, with `rowIndex` its place among all rows, the header counted          |
| Cell        | `role="gridcell"`, named by its value as drawn, with `columnIndex` its column       |
| Row header  | `role="rowheader"`, named by its number or `rowHeader`'s text, `columnIndex` 1      |
| Corner      | `role="columnheader"`, named `Row`, heading the row header column                   |
| Read-only   | the `readonly` state, on every cell that cannot be edited, and on a `readOnly` grid |
| Disabled    | `disabled`, on the grid                                                             |
| Editor      | `role="textbox"`, named by the column's `header`, while a cell is being edited      |

Focus stays on the grid as the active cell moves, and the cell is the
grid's active descendant, so a screen reader reads each one as the
keyboard reaches it.

The grid mounts only the cells in view, so it says where each one sits
in the whole data rather than among what is mounted. The grid's
`rowCount` counts every row with the header row as row 1, and its
`columnCount` every column with the row headers. Each row's `rowIndex`
is its place among those, so the 4,213th row of 100,000 is row 4,214 of
100,001. Each cell's `columnIndex` is its column, row headers counted,
so after a sideways scroll the first cell in view is still announced as
column 37 rather than column 1. The mirror writes these as
`aria-rowcount`, `aria-colcount`, `aria-rowindex` and `aria-colindex`
(see [Semantics](/access/semantics)).

## What this page has checked

The behaviour above is asserted by three specs that drive the real
runtime with a fake canvas: `DataGrid.spec.ts` and
`DataGrid.budget.spec.ts` beside the component, and
`DataGridExample.spec.ts` beside the example. Between them they cover
every key in both tables, and the arrows, End and a frozen column under
right to left as well; keys typed before the editor has the keyboard;
the click, the double click, the Shift+click and the drag; the
read-only column and the read-only grid; the controlled and
uncontrolled active cell and range, including an active cell written
from outside a long way off screen; a commit the application refuses,
and a commit reading back only its own cell; copy, cut and paste,
quoted values and a paste clipped at the edges; `revision`; the
disabled grid; a frozen column staying put while the rest scroll, in
both directions; and a grid of a hundred thousand rows by fifty columns
mounting fewer than 150 cells and reaching its far corner.

They also cover a column resized by a drag on its header's edge, in
both directions, down to its minimum and no further; a frozen column
moved along by a wider one before it; controlled widths; Alt+Shift and
the arrows, mirrored under right to left; a double click fitting a
column to a long value and to a short one; a column that is not
resizable and a disabled grid refusing all of it; frozen rows held
under the header, a row revealed below them and paging by the rows
left; row headers that number the rows or take their text from a
function, stay at the start in both directions, and select a row, a
run of rows and everything; the grid's size, each row's index and each
cell's column, including after a sideways scroll; and formulas shown
through the column format, edited as formulas, worked out again after
a commit and on a new `revision`, errors in the danger colour, a copy
taking results and a paste writing formulas, and letters in the
headers.

The budget spec holds two claims about speed. An arrow key writes to
the cells it moved between and no others, on a short grid and a tall
one alike. A jump that replaces every mounted row of a 1200 by 800 grid
builds no cell at all: the rows are recycled, and each cell is told
which row it now shows. In the test runtime that jump costs about 11
milliseconds a frame, down from about 30, most of it laying out and
painting the new text.

What they cannot check is the drawing. Nothing on this page has yet
been opened in a browser: the outline, the range's fill and border, the
freeze lines under a frozen row and after a frozen column, the
resize cursor over a header's edge, the letters in a header, the danger
colour of an error, the dimmed text and the editor in its cell are
things these specs do not see. A fitted column is measured with the
test runtime's measurer, which is not a browser's fonts. How a jump feels in a browser, with a scrollbar being
dragged, has not been tried. The clipboard has been checked as far as
the request the grid hands the shell and the text a paste delivers; a
real copy into another spreadsheet, and a real paste out of one, have
not been tried. No screen reader has been sat in front of it, and no
touch screen: a drag with a finger may scroll the grid rather than
select.

An input method cannot start an edit from the grid. The browser
composes only into an editable element, and while the grid has focus
there is none: the shell sends nothing for a key that belongs to an
input method, and the grid cannot be a `textInput` surface, which would
hand it the composition, without its cells dropping out of the
semantics tree. So press Enter or F2 first and compose in the editor,
which works as in any field. A key that reaches the grid as a plain
character opens the editor with that character as typed, and the input
method takes over from the next key, once the editor has focus; whether
a given input method lets the first key through that way has not been
tried.

Out of scope for now, and the obvious next steps: dragging across row
headers to select rows (a Shift+click does it today), selecting a
column from its header, a formula's references moving when rows or
columns are inserted, and a formula preview while one is being typed.
The resize grip is reachable only by pointer; the keyboard has
Alt+Shift and the arrows instead, and a screen reader is not told the
grip is there.

## Next

[DataTable](/components/data-table) is rows of records that sort and
choose rather than cells that edit, and
[Overflow and scrolling](/layout/overflow-and-scrolling) is what the
grid scrolls with.

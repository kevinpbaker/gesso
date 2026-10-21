---
'gesso-components': patch
---

`DataGrid` is new: an editable spreadsheet grid of any size, built on `LazySheet`, so a grid of a hundred thousand rows by fifty columns mounts only the cells in view. You give it the columns (a key, a header and a pixel width each, optionally `editable`, `align` and a display `format`), a `rowCount` and a `getValue(row, column)`; it never holds the data, asks only for what is on screen, and reports a committed edit through `onCellChange(row, column, value)`, reading the cells in view again straight after. A `revision` prop re-reads them when the data changes for any other reason.

The header stays while the rows scroll, and `frozenColumns` keeps columns at the start in view while the rest scroll sideways, on the right under a right-to-left reading. One active cell, controlled through `activeCell` and `onActiveCellChange` or left to the grid with `defaultActiveCell`, is walked with the arrows (mirrored right to left), Home and End, Ctrl or Cmd with Home and End, Page Up and Page Down, and Tab across a row; Tab off the end of a row leaves the grid rather than trapping the keyboard. Enter or F2 edits a cell, typing a character replaces it, Enter commits and moves down, Tab commits and moves across, Escape puts the old value back, and Delete clears it. Cells in columns that are not `editable`, or in a `readOnly` grid, refuse all of these. A click makes a cell active and a double click edits it.

The grid is announced as a `grid` whose active cell is its `activeDescendant` and is `selected`, with `columnheader` header cells, `gridcell` cells marked `readonly` where they cannot be edited, and rows that give their place in the whole data with `posInSet` and `setSize`.

---
'gesso-components': patch
---

`DataGrid` resizes columns, freezes rows, shows row headers, works out formulas, and tells a screen reader where each cell sits in the whole data.

Columns can be resized by dragging the edge at the end of a header, down to a column's new `minWidth` (40 pixels by default), by double-clicking that edge to fit the column to its widest value in view, or with Alt+Shift and Left or Right on the active cell's column. Under right to left the end edge is the left one, so a drag or Alt+Shift+Left the other way widens it. `onColumnResize(key, width)` reports every new width, and `columnWidths`, a record of widths by key, makes the widths the application's to own. A column with `resizable: false` keeps its width.

`frozenRows` keeps rows at the top below the header while the rest scroll under them, with a heavier line under the last one. `rowHeader` adds a column of row headers at the start that stays while the rest scroll sideways: `true` numbers the rows, or a function names them, in a column `rowHeaderWidth` wide. A click on a row header selects that row, a Shift+click a run of rows, and a click on the corner above them selects everything. Home and Ctrl+Home now also scroll the columns, and with Ctrl the rows, back to their start, so going home past a frozen pane no longer leaves the sheet scrolled.

With `formulas`, a value that starts with `=` is worked out as a formula with A1 references by column position and row number, and the cell shows its result through the column's `format` while the editor shows the formula. Every formula in view is worked out again after a commit, clear, cut or paste, and on a new `revision`. Errors are shown by their code in the danger colour, a copy takes a formula's result rather than its text, and each column header shows its letter.

The grid now says how many rows and columns it has (`rowCount` and `columnCount`, the header row and row headers counted), each row its `rowIndex` and each cell its `columnIndex`, which the mirror writes as `aria-rowcount`, `aria-colcount`, `aria-rowindex` and `aria-colindex`. Rows no longer carry `posInSet` and `setSize`, which belong to the items of a list or tree, not to the rows of a grid.

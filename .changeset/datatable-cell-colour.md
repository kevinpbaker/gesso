---
'gesso-components': minor
---

A `DataTable` hands each cell the colour its text should be drawn in, as the third argument to a column's `cell`: the control foreground, or the selection foreground while the row is chosen. The table set that colour on the row before, and `color` does not cascade from a parent node, so it reached no cell; a chosen row's text kept the default colour on the selection background, and in a dark theme the cells were black on a dark table. Bind it with `cell: (row, index, color) => <text text={...} color={color} />`. A cell that ignores it keeps the colour it names, as before.

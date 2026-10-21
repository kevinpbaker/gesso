---
'gesso-core': patch
'gesso-framework': patch
---

A grid can say where its rows and cells sit in the whole of its data, not only among the ones that are mounted. Four new semantics properties carry it: `rowCount` and `columnCount` on the `grid`, `treegrid` or `table` (use -1 when the count is not known), `rowIndex` on each `row` and `columnIndex` on each cell, all counting from 1. They are carried into the semantics record under the same names, and the accessibility mirror writes them as `aria-rowcount`, `aria-colcount`, `aria-rowindex` and `aria-colindex`. A virtualized grid used to leave a screen reader counting the cells in view, so after scrolling sideways the first visible cell was announced as column 1 whatever column it was really in.

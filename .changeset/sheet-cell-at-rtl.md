---
'gesso-core': patch
---

`UiVirtualSheet.cellAt` finds the right cell under right-to-left and over a frozen pane. A `LazySheet` that reads right to left starts at its right edge, with column 0 the rightmost, but `cellAt` measured a point from the left, so it answered with a column on the far side of the viewport. The window's viewport now says whether the sheet starts at its right edge (`SheetViewport.fromRight`), and `cellAt` turns the point around when it does; the point is still given in the container's own coordinates, measured from its top left, as a pointer event's local position is. A point over a frozen row or column now finds that row or column however far the sheet has scrolled, in either direction, rather than the cell scrolled out of sight behind it.

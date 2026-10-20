---
'gesso-core': patch
'gesso-components': patch
---

A `DataTable`, or any `LazyGrid`, whose columns are wider than it is scrolls sideways to reach them. The grid that holds the header and the rows was exactly as wide as the list, however far its tracks ran past it, and a scroll container measures its content by its children's boxes, so the columns past the edge were cut off with nothing to scroll to. The grid is now at least as wide as its fixed tracks, the floors of its `minmax` tracks and the gaps between them, so a sideways wheel or swipe moves the header and the rows together until the last column is in view. A table of `fr`, `auto` or `percent` columns still fits its box. Under right-to-left the overflowing columns are still out of reach, because scroll containers do not yet scroll toward their start side.

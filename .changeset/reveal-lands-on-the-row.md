---
'gesso-core': patch
'gesso-framework': patch
'gesso-components': patch
---

Scrolling a `DataTable`, `LazyList` or `Tree` to a row that was never mounted lands the row in view even when the rows are taller or shorter than the estimate. The jump goes by the estimate for every row on the way, and when that was short of the real height the row it was for ended up below the bottom edge, and stayed there: nothing ran another frame to measure it. A `UiVirtualWindow` can now hold an item in view (`holdInView`) until it has been measured, the runtime runs the frame that measures it, and the window folds the correction into the scroll adjustment it already returns.

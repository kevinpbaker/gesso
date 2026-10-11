---
'gesso-components': patch
---

`LazyList` lays each row across the list's whole width, as a row of any column is. Its rows were placed at their content's width, so a row with something at its end (a count, a time, a close button after a name that takes `flex: 1`) had it beside the name instead of at the right edge.

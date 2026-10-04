---
'gesso-core': patch
---

An absolutely positioned node is placed again when its containing block changes size, even when its parent keeps its box. A panel pinned to the window's corner from inside a column used to stay where that corner was when the window was resized, because nothing placed the column, and so the panel, again.

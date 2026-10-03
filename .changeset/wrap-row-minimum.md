---
'gesso-core': patch
---

A wrapping row's minimum height is all its lines, not its tallest item. In a column beside a sibling that grows, a wrapping row (a filter bar of chips, say) was squeezed to its first line and the rest spilled out over whatever came next. CSS counts every line, and so does this now.

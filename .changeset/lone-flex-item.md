---
'gesso-core': patch
---

A line's only flex item, growing and shrinking to fill a line of definite size with a minimum of its own, no longer marks its content as read: no base could change its size. Since a content basis started marking its subtree, an application region like that (the issue tracker's main pane) had every row its list mounted on a scroll laid out from the root.

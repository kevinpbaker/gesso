---
'gesso-core': patch
---

Revealing a node bigger than its scroll container brings it in by its start, unless it already fills the view, as CSSOM's `nearest` does. It was moved by its nearer edge, which for a tall node is its end: the issue tracker's issue page, which focuses the whole issue when it opens, opened scrolled to the bottom.

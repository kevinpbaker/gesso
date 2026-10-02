---
'gesso-core': patch
---

A laid-out subtree that moves without changing size is shifted instead of placed again. Boxes are absolute, so inserting a row near the top of a long list moved every row below it, and each one was placed again all the way down: an Enter in a 5,000-line document placed 9,572 nodes and took 18 ms of layout. It now places 7 and takes about 3 ms. `LayoutStats` gains `shifted`, the number of subtrees moved this way.

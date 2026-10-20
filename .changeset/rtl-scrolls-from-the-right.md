---
'gesso-core': patch
'gesso-framework': patch
---

A scroll container that reads right to left can reach everything in it. Its content starts at the right edge and overflows to the left, but its horizontal offset was clamped to `[0, overflow]`, toward the right, so a wide right-to-left table, row or sheet showed its first columns and nothing a wheel, a swipe or a dragged thumb could do reached the rest. Such a container now follows CSS: `scrollX` runs from minus the overflow up to `0`, where `0` shows the start edge and is where an unscrolled container sits. Its content extent is measured from the right edge, the horizontal thumb starts at the right of its track, revealing a row scrolls left to it, a sticky column at `right: 0` holds there, and a `LazyRow` or `LazySheet` mounts what the offset shows. `scrollBounds` and `scrollsFromRight` answer the range and the direction for a record. Text fields are unchanged: a field scrolls its own text by the caret, from `0` up.

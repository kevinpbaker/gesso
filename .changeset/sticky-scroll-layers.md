---
'gesso-core': patch
---

A scroll layer repaints a sticky node where a scroll carried it and where it sticks, so a spreadsheet's sticky header row and gutter no longer leave copies of themselves over the rows after scrolling down and back up. `LayoutEngine` gains `allStickyNodes()`, which `LayoutReader` may offer as well; a reader without it repaints a scroll layer whole every frame.

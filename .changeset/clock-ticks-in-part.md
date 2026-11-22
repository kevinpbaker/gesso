---
'gesso-core': patch
'gesso-components': patch
---

A frame where only a leaf was laid out again, and no box moved, is now drawn in part. Before, any layout pass counted as moving a box, so a label whose text changed in a box of the same size drew the whole surface. The layout engine still counts a pass as a move when a node with children, a sticky node or an anchored node was laid out, because those can change what is drawn without writing a box.

The video controls' time label keeps one width while the clip plays. A canvas cannot ask for tabular figures, and in `system-ui` on macOS the label was up to 6 px narrower or wider from one second to the next, which moved the volume and fullscreen buttons. The label's width is now held by hidden copies of it written with each digit, so the clock ticks without moving anything, and a playing clip draws no whole frames.

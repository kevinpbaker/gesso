---
'gesso-core': minor
'gesso-framework': patch
---

The focused node keeps its place on screen in its scroll container. When a layout moves it within the container, because something above it grew or shrank (a list of problems in an inspector, a section opened), the container scrolls by as much before the frame paints, as CSS's `overflow-anchor` does. Before, the field being typed in slid away under the caret, and the next click landed on whatever had slid under the pointer: in Flatwright, a section's header, and once a Delete button. Only the focused node, only while it is in sight, and only vertically; nothing focused, or a node scrolled out of view, leaves the offset as it was. The engine gains `scrollAnchor` and `anchorAdjustment` (and the `ScrollAnchor` type) for the runtime to do this with. Found by Flatwright's second UI review.

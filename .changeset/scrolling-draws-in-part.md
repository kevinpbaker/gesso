---
'gesso-core': patch
'gesso-framework': patch
---

Two kinds of frame that drew the whole surface now draw only what changed.

A list with a sticky header drew every scrolled frame whole, because a sticky node that shifts counted as a moved box. A shift inside a scroll container that scrolled on the same frame is now held in that container's clip, which the frame draws again anyway, so these frames are drawn in part. A shift for any other reason still counts as a move.

A pointer moving along a scroll container's scrollbar marked the container for repaint on every move, which for a grid that fills the surface drew all of it again each time. `LayoutEngine.revealScrollbars` now returns whether the bars change how they look, because they were hidden or fading, and the runtime repaints only then.

---
'gesso-core': patch
---

A virtual list or grid that scrolls now draws only its own viewport, not the whole surface. On a scroll, rows leave at one end and arrive, recycled, at the other, and each box that moved made the frame whole. A box that moves, or a node that is added or removed, inside a scroll container that scrolled on the same frame now stays within that container's clip, which the frame draws again anyway. A lifted or anchored node is drawn outside every clip, so it still counts as a move. A lifted node that was drawn last frame and is gone now makes the frame whole. Two smaller fixes come with it. A fragment that changed is placed by its nearest ancestor with a box, where before it made the frame whole. And a damaged rectangle that holds others already listed takes their place, so a frame that listed a grid's cells before the grid no longer counted their area twice.

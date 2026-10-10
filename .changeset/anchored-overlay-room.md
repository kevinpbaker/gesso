---
'gesso-core': patch
---

An anchored overlay taller than the room on the side it opens on is now cut to that room, instead of running off the edge of the window. The room reaches the overlay's layout the way a `maxHeight` would, so a scroll container inside it scrolls what does not fit. An overlay placed at a point, such as a context menu, that fits on neither side of the point but fits in the window opens on the side asked for and slides back over the point until all of it is on the screen, as a native context menu does, rather than starting off the top of the window. Overlays that fit are placed exactly as before.

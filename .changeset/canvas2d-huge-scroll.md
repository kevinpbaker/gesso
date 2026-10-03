---
'gesso-core': patch
---

Canvas2D draws a row millions of pixels down a scroll container on its pixel. Skia keeps the canvas transform and every coordinate in 32-bit floats, so a scroll offset of a hundred million pixels and a row at the same depth were each rounded to the nearest eight pixels, and the rows of a five-million-row grid came out with gaps and overlaps near the bottom. A translation of a million pixels or more is now held in a double and added to each coordinate before the canvas sees it. Nothing changes below that.

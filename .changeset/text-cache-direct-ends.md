---
'gesso-core': patch
---

Canvas2D draws text again on the frame where it stops being drawn directly. The text cache draws text that changes on most frames directly, then copies it from its own canvas once the text is still. Over a painted background, a copy can be one level lighter or darker per channel in the glyph edges, because the cache's canvas is transparent and keeps its pixels premultiplied and rounded to 8 bits. A partial frame or a scroll layer kept the direct pixels, and a whole frame drew the copy, so the two did not agree. Now the frame where direct drawing ends counts that text as repainted, so the screen shows what a whole frame shows. This costs one more draw of the text and never adds a frame. `TextRasterCache.beginFrame` now returns the nodes whose direct drawing ends on that frame.

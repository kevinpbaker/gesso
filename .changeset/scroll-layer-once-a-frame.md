---
'gesso-core': patch
---

Canvas2D paints a scroll layer at most once in a frame. A partial frame walks the tree once for each group of changed rectangles, and each walk that crosses a scroll container reaches its layer. Before, each of these walks painted the changed items into the layer again. In a data table, a change in the header while the scrollbar faded painted the whole layer once for each walk. In Chrome, the grid's rounded corner also showed antialiased pixels up to 3 levels different from a whole frame. Now only the first walk paints the layer, and the other walks copy it. The corner pixels are the same as in a whole frame.

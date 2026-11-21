---
'gesso-core': patch
---

Canvas2D draws a border or a decoration stroke with square corners when it has no corner radius, as CSS and the WebGPU renderer draw it. Before, all of these strokes used round joins. This cut each outer corner by half the line width and left the corner pixel partly covered. Chrome's GPU canvas can cover that pixel differently the first time a stroke is drawn than later. So in `DataGrid`, the corner of a selected cell's outline was painted into a scroll layer on the frame the selection changed, and it stayed up to 17 levels different from a whole frame. A border with a radius still uses round joins.

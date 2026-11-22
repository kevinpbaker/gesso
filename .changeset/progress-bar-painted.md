---
'gesso-components': patch
---

`ProgressBar` paints its fill and its indeterminate sweep at a fraction of the track instead of laying them out there, as `Slider` with `paintedFill` does. Each step of the sweep, and each new value, was a layout change, so it drew the whole surface. Now it is a new picture of a box that does not move, and the frame draws only the track. The edges are snapped to device pixels as a laid-out box's are.

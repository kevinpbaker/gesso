---
'gesso-core': patch
---

Canvas2D draws a changed `Paint` picture with the same line and paint settings as its bitmap. On a frame where a picture changes, the renderer draws its recording directly onto the frame. Before, that drawing used the settings that earlier drawing left on the frame: the color, line width, cap, join, miter limit and dash of the last border or ring. A bitmap starts from canvas defaults. So a painter that did not set these values drew one way on the frames where it changed and another way a few frames later, when it became a bitmap. Now the direct drawing starts from the canvas defaults too. Opacity, a filter and the transform still apply, as they do to the bitmap. WebGPU always draws the bitmap and does not change.

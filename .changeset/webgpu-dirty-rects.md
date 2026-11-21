---
'gesso-core': minor
---

WebGPU draws a frame in part, as Canvas2D does. It now draws every frame into a texture it keeps and copies that to the screen, so a frame the runtime vouched for, in which no box moved, clears and draws only the rectangles its changes cover: a caret blink, a hover tint or a fading scrollbar costs one control, not the screen. The build is culled to those rectangles and every draw is cut to them; changes far apart are drawn in separate builds. A frame with nothing to draw does not touch the swap chain at all. The fallbacks to a whole frame are Canvas2D's, from the same `FrameDamage`, which moved out of `canvas2d/` to be shared. `WebGPURendererOptions.dirtyRects: false` turns it off, and `WebGPURenderer.damageStats` counts whole and partial frames.

One node repainted in the 5,001-node bench, all on screen: 6.29 ms to 0.12 ms of CPU time per frame.

---
'gesso-core': minor
---

Canvas2D draws only what changed. When the runtime reports which nodes a frame changed and no box moved, the renderer clears and draws again only the rectangles those nodes cover, and walks only the nodes that reach them. The rest of the canvas keeps the last frame's pixels. A caret blink, a hover tint or a focus ring now costs the walk and raster of one control, not the whole screen. In `pnpm bench:frame`, one node repainted in a 5,001-node tree with every row on screen went from 2.85 ms to 0.12 ms.

The whole canvas is still drawn when the change is not local: the first frame, a resize or a new pixel ratio, a restored canvas, a font that loaded, any box that moved (a transform or sticky node included), a change on the root (a theme, a fading scrollbar), a turn above the change, the inspector's overlay, a lifted node on screen, or damage over half the canvas. Anything drawn by the clock rather than by a property (a video, a picture stretched while its zoom moves, a caret) is drawn again where it was on the next frame.

`Canvas2DRendererOptions.dirtyRects: false` turns this off. `Canvas2DRenderer.damageStats` counts whole and partial frames. WebGPU still draws every frame whole.

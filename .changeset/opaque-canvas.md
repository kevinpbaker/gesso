---
'gesso-core': minor
'gesso-framework': minor
---

`createApp({ opaqueCanvas: true })`, and `.opaqueCanvas()` on `createSyncApp`, ask for the canvas's 2D context opaque, so the browser may draw its text with subpixel (LCD) antialiasing, as it draws a page's text on Windows and Linux. A browser draws subpixel text into a 2D canvas only when the canvas is opaque: measured in Chrome on Linux, the same line had 1,539 colour-fringed pixels as page text and on an opaque canvas, in a worker too, and none on a see-through one. Off by default, because what the application does not paint is then black, and because on an opaque surface Canvas2D draws text every frame instead of copying it from the see-through canvases it keeps text and scrolled content in, whose copies would be grayscale. Text in an opacity group or a `rasterize` subtree, and all WebGPU text, stays grayscale. `CanvasSurface` and `createCanvasSurface` take `{ opaque }`; on an opaque surface `Canvas2DRendererOptions.textCache` and `scrollLayers` default to false.

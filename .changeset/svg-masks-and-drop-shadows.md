---
'gesso-core': minor
---

SVG files draw their masks and drop shadows, as Chrome draws them. A `<mask>` cuts what it masks by its luminance, or by its alpha for `mask-type: alpha`, with its region and content in user space or the masked element's bounding box. A `<filter>` that is one `<feDropShadow>` draws the element's shadow, moved, blurred and in its flood colour at its flood opacity, beneath it. `parseSvg` no longer reports either as `unsupported`; any other filter still is, as is a `mask` or `filter` that names nothing. `PaintSurface` gains masked layers to draw them with: `beginMaskedLayer(x, y, width, height)`, `layerMask(mode)` and `endMaskedLayer()`, which a host without layer canvases draws as the content unmasked. `blur` on a `PaintSurface`, and so a node's `blur`, is now measured in the coordinates it is called in, as its documentation said, where it was in device pixels: on a display of two device pixels to the logical one, a blur is twice as wide as before.

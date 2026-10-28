---
'gesso-core': minor
'gesso-framework': minor
'gesso-components': minor
---

SVG files draw. An `Image` whose source ends in `.svg` or is a `data:image/svg+xml` URL reads the file in the worker and draws it as vectors through `PaintSurface`, on either renderer, at whatever size the node is laid out at, rather than failing because `createImageBitmap` refuses SVG. `objectFit` places it, the file's own size sizes the node when nothing else does, and `currentColor` is the theme's text colour. Drawn: paths and basic shapes, groups, `<use>`, nested `<svg>`, transforms, fills and strokes with opacities, dashes, linear and radial gradients, clip paths and simple `<style>` rules; text, images, masks, filters, patterns and markers are skipped with a console note. New in `gesso-core`: `parseSvg`, `drawSvg`, `svgPaint`, `DefaultSvgResolver`, `isSvgSource`, and `imageSource`'s `vectors` argument; in `gesso-framework`, `MediaService.vectors`, `setSvgResolver` and the `media.vectors` option. `Image` is now built on a paint node rather than a box.

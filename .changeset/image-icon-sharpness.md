---
'gesso-core': patch
'gesso-framework': patch
---

Pictures and icons are sharper. The copy of an image kept at the size it is drawn is now resampled at high quality instead of the browser's default low setting, which skipped source pixels once an image was shrunk to less than half its size, so a photo made into a thumbnail shimmered and its edges stair-stepped; the copy is made once per size, so the better filter costs nothing per frame. Icons are rasterised at the display's real pixel ratio instead of always at 2x, so they are no longer resampled, and soft, on 1.25x, 1.5x and 3x screens, and they are drawn again when a window moves to a screen with another ratio. `IconRasterizer` takes `setScale`, `pixelScale` and `onScaleChange`, and `IconSpec` an optional `scale`; a rasteriser an application supplies keeps the scale it was built with.

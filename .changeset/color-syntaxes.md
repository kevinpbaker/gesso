---
'gesso-core': patch
---

Colours written as `hsl()`, `oklch()`, `oklab()`, `color(display-p3 …)` and `color(srgb …)` now paint, as do `rgb()` and `hsl()` in CSS's space-and-slash syntax (`rgb(255 0 0 / 50%)`); before, each painted nothing and warned. The canvas draws in sRGB, so a Display P3 or OKLCH colour outside it is converted and clipped to the nearest sRGB colour. The WebGPU backend now parses colours with the same function as everything else; its own parser read an eight-digit hex as AARRGGBB rather than RRGGBBAA, which went unseen only because it was never handed one.

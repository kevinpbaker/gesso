---
'gesso-core': patch
---

WebGPU draws scaled and shrunk content as cleanly as it draws it at 1:1. A shape's edge was softened over one logical pixel whatever scale it was drawn at, so a node zoomed to 3x had edges three pixels soft and one shrunk to a third had jagged ones; coverage is now measured in the device pixels the shape actually lands on, for shapes, borders, shadows and rounded clips alike, and the quad grows by one device pixel of its own space rather than of the screen's. Text under a scale or a turn is rasterised at that scale, in quarter-octave steps, and sampled smoothly, where it was stretched from cells made for 1:1 with nearest sampling and looked blocky. Unscaled drawing is unchanged pixel for pixel.

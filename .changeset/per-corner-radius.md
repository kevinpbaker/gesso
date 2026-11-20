---
'gesso-core': patch
---

Corners that differ are drawn as asked. A `borderRadius` of `{ topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0 }` rounded all four corners at 8 in both renderers, because each drew the largest corner at all four; now each corner has its own radius in the background, the border, the clip a rounded `overflow: 'hidden'` makes, shadows, and focus rings and other decorations. Corners that do not fit are scaled down together as CSS scales them. The WebGPU instance and clip layouts grow by four radii to carry them. `fitBorderRadius`, `offsetBorderRadius` and `borderRadiusIsUniform` are exported, and a `DecorationRect` carries its `corners`.

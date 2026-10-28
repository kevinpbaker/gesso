---
'gesso-core': patch
---

`opacity` now fades a node and everything inside it as one picture, as CSS does, in both renderers. A disabled button — a box at `opacity: 0.5` with a white label — used to fade each draw on its own, so the label was faded twice, once in its own draw and again through the half-transparent box under it, and came out grey (202,207,213 over a white page where CSS and Figma give white). The subtree is now drawn at full strength into a layer the size of what it paints and blended once at the opacity: an offscreen canvas in Canvas2D, a render pass into a texture in WebGPU. A node whose whole subtree is a single draw — a faded icon, a faded line of text — still fades that draw directly, which is the same picture for nothing. Where Canvas2D has no `OffscreenCanvas` (or the `createLayerCanvas` option gives none), opacity falls back to fading each draw, as before.

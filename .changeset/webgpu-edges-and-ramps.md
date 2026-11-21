---
'gesso-core': patch
---

WebGPU no longer draws a dark fringe around a transparent picture, and its gradients and soft shadows no longer band. A picture was uploaded with straight alpha and sampled with linear filtering, which averaged the colour of its transparent texels (black, in most PNGs) into the edge beside them, so a transparent picture drawn at any scale but one had a dark ring Canvas2D does not draw. Pictures are now uploaded premultiplied and blended as premultiplied colour, as an opacity group's layer already was. In a scaled-up transparent disc the largest difference from Canvas2D went from 64 levels to 10. Gradients and shadows were written at 8 bits with no dithering, so a long, subtle ramp stepped; they now get under half a level of per-pixel noise, which leaves a flat fill exact. Across a 16-level ramp 672 device pixels long, the longest run of one value went from 43 pixels to 20.

---
'gesso-testing': patch
---

`renderTest`'s canvas double now reports its transform, as a browser's context does. Without it, the renderer could not say where on the surface something was drawn. Every caret blink and fading scrollbar counted as drawn somewhere unknown and made the next frame whole, which no browser does. Pictures and decorations were also not put on device pixels. A spec that counts whole frames, or reads an image's exact drawn size, now sees what a browser draws: an image's edges are within a pixel of the exact scale.

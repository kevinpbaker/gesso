---
'gesso-core': patch
---

Scrolled content is drawn on a whole device pixel. The offset keeps the fraction, so a trackpad's small steps still add up, but Canvas2D drew the content at the exact offset, and text between pixels rasterised differently each frame, shimmering as a flick slowed down.

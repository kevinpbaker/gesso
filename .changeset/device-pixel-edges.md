---
'gesso-core': patch
'gesso-framework': patch
---

Edges are sharp at every display scale. Layout keeps its fractions, as Chrome's does, but backgrounds, borders and clips are now painted on whole device pixels, as Chrome paints them: a box at 10.4 had a soft edge, a 1px border at 1.5x covered two half-strength pixels, and boxes that met at a fractional edge left a faint seam. Both renderers snap through the same rule, and only under a plain translation, so a node scaling or turning is left where it is. The canvas's backing store is also sized from the browser's `device-pixel-content-box` where it reports one (Chrome, Firefox), so a canvas at a fractional position or on a 125% or 150% display is no longer resampled as a whole by a pixel; the logical size is nudged by under a device pixel to match.

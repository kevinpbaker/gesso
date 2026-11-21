---
'gesso-components': patch
---

A playing clip's seek bar moves without a layout change, so its frames are drawn in part on both renderers. The fill and thumb were laid out at the position, and every step of it (ten a second) was a layout change, which draws the whole surface. `Slider` has a new `paintedFill` prop that draws the fill and thumb at the value instead, on whole device pixels as a laid-out box is; `VideoControls` turns it on for the seek bar. A slider with its label hidden also stops giving the hidden label new text, which was laid out once a second for a seek bar.

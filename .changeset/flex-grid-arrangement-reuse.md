---
'gesso-core': patch
---

A flex or grid container placed in the box its measurement already used no longer lays its children out a second time: placement takes the lines (or the tracks and placements) that measurement worked out. A full layout pass of five thousand nodes is about 7% faster.

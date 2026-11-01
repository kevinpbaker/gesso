---
'gesso-core': patch
---

A box's corner radius fits the box before its shadows are drawn, as CSS does: a rounded box of no size leaves no hole under its shadow, where WebGPU cut a circle the size of its radius.

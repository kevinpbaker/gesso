---
'gesso-core': patch
---

A drop target with `autoScroll` now scrolls while a drag is held near its edge even when a deeper drop zone, such as a row inside the list, is the one that would take the drop. Before, auto-scroll ran only on the winning zone, so a list whose rows were drop targets never scrolled during a drag. Drop zones can implement the new optional `UiDropZone.hover(state)`, which is called for every accepting zone under the pointer, and `dropTarget` uses it for auto-scroll.

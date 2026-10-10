---
'gesso-core': patch
---

A painted node whose picture changes is repainted without being laid out again, unless the new picture declares a different intrinsic size. Before, every new picture marked layout, which for a painted node sized by its parent (`height: percent(100)`, say) laid the tree out again up to the root on every repaint: a minimap redrawn on each frame of a scroll re-measured thirteen nodes a frame for nothing. Property definitions gain `narrowEffects`, which lets a property mark less than its worst case for a particular change.

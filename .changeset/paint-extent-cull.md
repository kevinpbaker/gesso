---
'gesso-core': patch
---

The renderers cull a node by where its subtree may paint rather than by its own box, so a child painting outside a parent that doesn't clip, as the docs say it may, is drawn when the parent's box is off screen or empty. The issue tracker's tour, an absolutely positioned panel inside an empty wrapper, was laid out and never drawn. Each layout record keeps that extent, the box whenever nothing reaches past it, so culling costs what it did.

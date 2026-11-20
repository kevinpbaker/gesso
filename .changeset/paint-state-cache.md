---
'gesso-core': minor
---

Both renderers keep each node's resolved paint state until something it was resolved from changes, instead of resolving every visible node's forty-odd style properties on every frame. A node's state is keyed by its `propertyVersion` and its environment, which hold everything it inherits and the theme; an editable field is still resolved each time, since its text lives in its model, and a paragraph's selection and find matches are read on every call. On the frame benchmark's 5,001 nodes, resolving every node goes from 4.07 ms to 0.22 ms when nothing changed, and the Canvas2D walk with nothing culled from 7.14 ms to 3.18 ms. `paintStateOf(node)` is exported for anything else that reads a node's paint.

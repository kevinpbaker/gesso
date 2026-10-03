---
'gesso-core': patch
---

A flex line that fits to within float noise no longer flexes. A container sized to its content sums its items in one order and the line sums them in another, so "exactly enough room" could arrive as -3e-14 and shrink an item with a fixed `width: 28` to 27.99999999999997.

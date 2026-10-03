---
'gesso-components': patch
---

A `Tree` draws its labels and arrows in `controlForeground`, and a chosen row's in `selectionForeground`. The colour was set on the row, and `color` does not cascade from a parent node, so the text drew in the text style's colour instead: black, in a dark theme as in a light one, which left a dark tree's labels nearly invisible.

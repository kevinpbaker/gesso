---
'gesso-components': patch
---

A `Toast` declared already open takes the theme of the tree it's declared in. It used to open before its placeholder was in the tree, with nothing to take a theme from, so a toast mounted afresh for each notice drew in the light theme on a dark app; it now waits for the placeholder.

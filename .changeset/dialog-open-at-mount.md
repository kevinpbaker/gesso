---
'gesso-components': patch
---

A dialog open from the moment it mounts takes the theme it was declared in. It opened before its placeholder was in the tree, inherited no theme, and drew in the light palette over a dark page; an opening asked for before mount now waits for it.

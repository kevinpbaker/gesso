---
'gesso-core': patch
---

A colour that's neither a palette name the node's theme carries nor a colour now warns on the console, once a name, instead of painting nothing in silence. The issue tracker used a `surfaceRaised` that no theme has, in six places; none of them ever painted.

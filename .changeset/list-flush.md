---
'gesso-components': patch
---

`Tree` and `LazyList` take `flush`: drawn as part of the surface they sit in, with no border, no background of their own and square corners. A sidebar's file tree is the case, where a framed box inside the panel reads as a form field. The focus ring is kept.

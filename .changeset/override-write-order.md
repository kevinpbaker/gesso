---
'gesso-core': patch
---

A modifier writing a property it already holds no longer sorts the property's overrides or allocates, which an animated modifier did on every frame.

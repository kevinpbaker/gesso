---
'gesso-core': patch
---

A `ref` is handed its node once the node's props are all written and it has the environment it will be under, wherever `ref` sits among the props. It used to fire as the builder reached it, so a node built this pass had the default environment: an overlay opened from a placeholder's ref, as a `Toast` mounted already open does, took the light theme in a dark app.

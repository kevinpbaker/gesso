---
'gesso-core': patch
---

A re-render that stops declaring a property takes it off the node. Only bindings were torn down before, so a plain value stayed: a conditional that swapped `<scrollview padding={20}>` for a `<scrollview>` reused the node and kept the padding. What modifiers and the runtime write on a node is left alone, and a modifier overriding the property keeps its value. `UiGraph.removeNodeProperty` is the removal, through the same cascade as a write.

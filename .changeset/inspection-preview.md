---
'gesso-framework': minor
---

`InspectionService.preview(node, property, value)` draws a node as though it declared a value, over its own and over its modifiers, until `endPreview` or the node leaves the tree: what a design editor shows while a colour is hovered or a padding dragged, before writing it to the source.

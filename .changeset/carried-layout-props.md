---
'gesso-core': patch
---

A layout pass no longer reads every node's layout properties again when none of them changed. `UiNode` counts writes in a new `propertyVersion` and gains `removeProperty`; write `properties` through `setProperty` and `removeProperty` so the count stays exact. A full layout pass over a 5,000-node list is about 20% faster again, and a window-resize step over 500 paragraphs now fits a 16 ms frame.

---
'gesso-core': patch
---

Removing a node now drops the layout records of everything under it, not only its own. `UiGraph.removeNode` unlinked every removed node from its parent before telling the removal listener, so the layout engine's walk down from the removed root found no children, and the records of every descendant — sticky and absolutely positioned ones included — stayed for the life of the app. Anything that removes subtrees as it goes, a virtualised list or grid above all, got slower with every scroll, because each frame walked every sticky node ever mounted: gessosheet's frame went from 2.4 ms to 5.7 ms over eight scrolls of an unchanged sheet, and stays at 2.1 ms with this fixed. The listener is now called with the removed root already out of the tree and its subtree still linked under it, and the rest is unlinked afterwards.

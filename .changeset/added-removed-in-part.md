---
'gesso-core': patch
'gesso-framework': patch
---

A frame that adds or removes nodes is now drawn in part. A tooltip, a menu or a select list that opens or closes used to draw the whole surface. `LayoutEngine.takeMoves` now also describes three more changes. A node laid out for the first time is drawn where it is. A node taken out of the tree is drawn over where it was, through the parent it was taken from: `UiGraph.setNodeRemovedListener` passes that parent, and `LayoutEngine.detachNode` takes it. A node whose own layout changed, such as a clip let go, is drawn over its whole extent as it was. A node whose only change is its children is not drawn as itself: each child added, removed or reordered is drawn on its own, so an overlay layer the size of the surface no longer counts as damage.

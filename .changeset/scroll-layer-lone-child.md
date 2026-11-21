---
'gesso-core': patch
---

Canvas2D repaints less of a scroll layer when the scroll container has one child that holds the rest. A lazy grid (`DataTable`) puts its header, spacers and rows in one Grid. Before, the layer's damage used the container's children, so a change in any row or in the header repainted the whole layer. Now the damage uses the children of such a child, so only the changed rows are repainted. A change to that child's own paint still repaints all of it. A child that scrolls, has a transform or is sticky is not looked through.

A change inside a sticky node is now also repainted where the node is drawn. Before, a scroll layer used only the node's layout box. When a table's header was stuck at the top, that box was above the viewport, so a change in the header was not repainted. In `DataGrid` this left the header text different from a whole frame.

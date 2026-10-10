---
'gesso-core': patch
---

A press whose node is taken out of the tree mid-drag goes on to the nearest of that node's ancestors still in it. A drag-select in a virtual list whose row scrolled out of view, and was unmounted, sent the rest of the drag to a node nothing could hear from; the list, and whatever listens above it, now gets it.

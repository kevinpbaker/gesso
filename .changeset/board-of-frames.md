---
'gesso-core': minor
'gesso-framework': minor
---

A tree drawn under transforms no longer costs a walk of all of it on every frame. A transformed node's subtree bounds are now its box and its children's carried out through its transform, where they were left unbounded and made every ancestor unbounded too; the hit tester passes such a subtree over when the point is outside it, and the accessibility mirror passes over what a panned, zoomed parent draws off screen (`LayoutEngine.screenBounds`). `InspectionService.box(node)` gives a node's box without building the rest of its report, for an editor that measures many nodes as its view moves. On a design tool's board of a thousand frames under one camera, a pan went from about one frame in three seconds to frames of about 25 milliseconds.

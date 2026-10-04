---
'gesso-core': patch
'gesso-framework': patch
---

An anchored overlay (a tooltip, a menu, a popover) now opens beside where its anchor is drawn when an ancestor of the anchor has a `transform`. A card on a panned and zoomed canvas used to get its tooltip where the card would be at zoom 1 with no pan, often nowhere near it; the anchor is now carried through every ancestor's translate, scale and rotation, as well as the scroll offsets it already followed, and an overlay that lives under a transform of its own is placed in that space. The accessibility mirror puts its elements over the same drawn boxes, so a screen reader's outline and touch exploration find the card where it is. A node's own transform still takes no part, so a turning spinner neither shakes its tooltip nor moves its element. `LayoutEngine.screenBox(node)` answers the question for anything else that needs it.

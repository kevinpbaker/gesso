---
'gesso-core': patch
'gesso-framework': patch
---

Revealing a node, a caret or a focused field, and holding the focused node in place, go by where it is drawn under a `transform`, not where it is laid out. A scroll container whose content is drawn zoomed (a page of paper laid out at full size and scaled by 2, in a box as big as the zoomed page) compared the caret's record, at zoom 1, with an offset in the zoomed space: the caret of a field low on the page was found above the view, and the first key typed sent the view to half the field's depth. `LayoutEngine.revealAdjustments`, `scrollAnchor` and `anchorAdjustment` now carry the target through each transform between it and its container, as `screenBox` does. A tree with no transform is unchanged. Found in Calcwright, where typing in a new plot zoomed in low on a page jumped the view up the page.

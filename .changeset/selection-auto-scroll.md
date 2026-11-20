---
'gesso-core': minor
'gesso-framework': patch
---

A selection dragged to the edge of a scrolling pane, or past it, scrolls the pane, and keeps scrolling and growing while the pointer is held still there, as a browser does past the bottom of a page; before, the pane stayed put and text beyond it could not be reached in one drag. The speed grows with how far into the 24-pixel edge band or past the edge the pointer is, and a pane already at its end hands the scroll to the one around it. It works for canvas text and for a drag inside a text field. `UiSelectionAutoScroller` is the part in `gesso-core`, and `UiPointerController` reports the drag through `selectionDrag`.

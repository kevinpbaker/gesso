---
'gesso-core': patch
'gesso-framework': patch
'gesso-components': patch
---

Everything that measures a node against the canvas now takes the `transform` of every ancestor into account, as painting and hit testing always have. Under a panned and zoomed parent (cards on a map inside a "camera" box) several things used to work from where the node would be drawn at zoom 1 with no pan:

- A press from the accessibility mirror or an automation tool, and Enter or Space on a focused button, now click the centre the node is drawn at rather than a point that could be off the node entirely.
- A modifier's `layoutBox()` and the box `onLayout` reports are the drawn box, so a slider, split pane or colour picker on a zoomed card turns a press into the right value, and `onLayout` hears when a pan above the node moves it on screen. Its size is the drawn size, so a fraction of it stays a fraction; `flowBox()` keeps the laid-out size, and the motion pivot, `breakpoint`, `sizeContainer` and `publishInset` now read that, so a zoom neither shifts a pivot nor crosses a breakpoint. The new `measureFlow` modifier is `measure` for the laid-out box; a virtual list's reveal and a `DataTable`'s sticky header use it, so they scroll by the right amount under a zoom.
- The caret rectangle handed to the shell, which positions the hidden text field and the IME candidate window, follows the caret where it is drawn.
- A press beside the fields of an editing group, a drag across them, and a text selection dragged past the end of a line find the field or line nearest the pointer on screen.
- The mirror's box for a focused node that is scrolled out of view, and the layout inspector's highlight and heatmap, are drawn over the node where it is.

`LayoutEngine.screenBox(node, part?)` takes an optional rectangle in the node's own coordinates and answers where that part of it is drawn. `EditingHost` and `SelectionHost` take an optional `screenBox`; a host without one behaves as before. With no transform above a node, every answer is the same as before.

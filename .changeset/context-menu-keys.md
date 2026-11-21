---
'gesso-core': minor
'gesso-framework': patch
'gesso-components': patch
---

The Menu key and Shift+F10 open a context menu. The keyboard controller sends the focused node the `ContextMenu` event a right-click sends, so `ContextMenus` and the `contextMenu` modifier answer both without asking which. With nothing focused, it asks the text node the canvas selection ends in. A key listener that calls `preventDefault()` takes the key. The event has no buttons and no modifiers, so Shift+F10 does not read as a Shift-click.

The runtime opens the menu from under the caret in a field, and otherwise from the focused node's lower left, kept inside the canvas. `KeyboardControllerOptions.contextMenu` takes that point (`menuAt`) and the node to ask when nothing has focus (`unfocused`), `isContextMenuKey(key, modifiers)` says which keys ask, and `UiSelectionController.endNode` is the text node a selection ends in.

The worker shell cancels both keys on the spot, as it cancels Tab, and the editing proxy's textarea and the semantics mirror hold the browser's menu back, so the browser's menu no longer opens over the app's.

`ContextMenus` no longer shows a blank row between Paste and Select All, or between a link's items and a field's: the rule is drawn above the item that starts a group, and there is no empty item for the arrows to stop on.

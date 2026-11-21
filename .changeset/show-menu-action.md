---
'gesso-core': minor
'gesso-framework': patch
---

A screen reader's command for a menu opens the node's context menu. VoiceOver's VO+Shift+M asks the element it is on for its menu, and the browser hands the page that request as a `contextmenu` event, which the semantics mirror held back and dropped. The mirror now sends a new `showMenu` semantics action for the element's node, and the runtime dispatches the `ContextMenu` event the Menu key sends, from under a field's caret or the node's lower left, without moving focus. A `contextmenu` that arrives within a second of the Menu key or Shift+F10 is the browser following the key, which has already asked, and is not sent again. `UiSemanticsAction.action` takes `'showMenu'`.

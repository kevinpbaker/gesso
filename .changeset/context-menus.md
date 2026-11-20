---
'gesso-components': minor
'gesso-framework': minor
'create-gesso-app': patch
---

A right-click opens a menu again. The browser's own is held back over the canvas, and nothing took its place, so right-clicking a field, selected text or a link did nothing. `ContextMenus`, wrapped round an app's root once, offers Cut, Copy, Paste and Select All on a text field (focusing it first, as a browser does), Copy on selected text, and Open Link in New Tab and Copy Link on a `Link`. It answers only what nothing inside answered, so a node with its own `contextMenu` keeps it. `EditingService` gains `cut`, `copy`, `paste`, `selectAll`, `copyText`, `selectedText` and `focusedField`, which it does through the shell's clipboard. Both `create-gesso-app` templates wrap their screen in it.

---
'gesso-framework': patch
---

`ShellService.readText()` reads the system clipboard's text, for a Paste chosen from a menu: a key's paste brings its text with it, a menu's has to ask. It resolves to null where the browser refuses (it wants a secure context and focus, and may ask the person first) or no shell is installed, and never rejects. Both shells answer it, the worker's through a `clipboardRead` message and its `clipboardReadResult`.

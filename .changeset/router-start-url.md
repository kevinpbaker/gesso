---
'gesso-framework': patch
---

An app opened at a deep link now starts on the screen that link names. The runtime builds its tree as it is constructed, and the window's address used to reach it afterwards, so for a moment every app was at `/`: its root route's screen was built and its effects ran before the real address moved it on. An app whose home screen does something on mount, such as opening the last document used, did it for a tab opened at `/d/new`.

`GessoRuntimeOptions.url` is new: the address to start at, resolved before the routes so the first tree is the right one and no guard on `/` runs for a window that was never there. Both hosts pass it — the worker host in its `init` message, the single-thread host from its history — and `setUrl` is for every address after. A guard that redirects the starting address is still reported to the shell as a replace, held until the shell is listening as other early requests are.

---
'gesso-framework': patch
---

`ShellService.warnOnLeave(on)` says whether leaving the page would lose work. While it is on, the shell has the browser ask before the page is closed, reloaded or left, in both the worker and the single-thread configurations; the `beforeunload` listener exists only while it is on, so the page stays in the back/forward cache otherwise. A shell that connects after it was turned on is told, and an app that is disposed takes the warning with it. The render worker sends it as a new `leaveWarning` message.

---
'gesso-framework': patch
---

The shell opens folders. `ShellService.openDirectory` shows the folder picker and remembers the folder under a number, as it does a file, and `reopenDirectory` asks for it again after a reload. Nothing in the folder crosses the barrier: the thread that reads it (an app worker, typically) takes the handle with the new `rememberedDirectory(handle)`, from the IndexedDB store every thread of the page shares. `ShellFileResult` gains `directory`, and `ShellRecentFile` gains `kind`.

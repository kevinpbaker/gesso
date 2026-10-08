---
'gesso-framework': patch
---

`ShellService.saveFile` takes `remember: false`, for a file made to keep rather than to open again — an exported picture, a report. It is written where the picker says, as any save is, but does not join the recent files, and its answer has no handle to save back to.

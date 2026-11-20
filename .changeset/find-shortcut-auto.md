---
'gesso-framework': minor
'gesso-components': patch
'create-gesso-app': patch
---

Ctrl/Cmd+F works out of the box. The runtime tells the shell whether a `FindBar` is mounted, and the shell takes the shortcut from the browser exactly while one is, so an application with a bar no longer has to know to pass `interceptFind: true`, and one without keeps the browser's find. `interceptFind` still overrides it either way. `FindService.hasBar` says whether a bar is mounted, and `ShellService.claimFindShortcut` is the request behind it. Both `create-gesso-app` templates now mount a `FindBar`.

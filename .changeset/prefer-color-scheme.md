---
'gesso-framework': patch
---

`ShellService.preferColorScheme('light' | 'dark' | 'auto')` lets an application with an appearance setting of its own tell the shell which appearance to report, from the render worker too, as the host's `setColorScheme` does. A host can then start the app in a stored choice before the first frame (`createApp({ colorScheme })`) and the app can still go back to following the system.

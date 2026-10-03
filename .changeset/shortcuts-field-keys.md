---
'gesso-core': patch
---

A focused text field keeps its editing keys. An application-wide shortcut on `Mod+Z`, `Mod+A` or a word or line move no longer fires while keys go to a field, so undo in a field undoes the typing rather than the app's last change. Other modified keys, and Enter in a single-line field, still reach the registry.

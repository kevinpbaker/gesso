---
'gesso-core': patch
---

A bare Enter or Space is no longer a shortcut while a button or link has focus, unless the shortcut is that control's own. Pressing a button is a default action applied after the key has been through the registry, so an application-wide Enter took the key from the focused button: in the issue tracker, Enter on "Clear selection" opened the issue under the list's cursor instead of clearing.

---
'gesso-electrobun': patch
'create-gesso-app': patch
---

`standardMenu(appName)` in `gesso-electrobun/desktop`: the application, Edit and Window menus every Mac application has, for `ApplicationMenu.setApplicationMenu`. Without an Edit menu macOS sends ⌘V and ⌘C nowhere, so text fields in a desktop window could not be pasted into or copied from. The Electrobun template installs it.

---
'gesso-core': patch
'gesso-framework': patch
'gesso-components': patch
---

`MenuItem` takes `items`, a submenu: it opens beside its item on a press, the pointer resting on it, Enter or Right, Left or Escape goes back, and a choice in it is the menu's own, closing both. `Menu` takes `compact`, for shorter rows in a long context menu, as `Select`'s.

`FocusService.releaseTrap` (and `UiFocusManager.popScope`) take the node trapped in, and end only that trap: none, when it ended already. A trap ends by itself when its subtree is removed, and a menu that released its trap after closing ended the trap under it as well, a submenu's menu's, leaving the keyboard nowhere.

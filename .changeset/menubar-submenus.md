---
'gesso-components': minor
---

A `MenuBar` menu can hold submenus, as a `Menu` can. An entry `{ label, submenu: entries }` shows `›` and opens its entries beside it: Right, Enter or Space opens it from the keyboard, the pointer resting on it opens it, and Left or Escape goes back to it. A command chosen in a submenu goes to `onChoose` and closes everything. `MenuBarState` has an optional `trail` for the submenus open, and `isMenuBarSubmenu`, `menuBarLevels` and `MenuBarSubmenu` are exported. `MenuBarEntry` now includes `MenuBarSubmenu`.

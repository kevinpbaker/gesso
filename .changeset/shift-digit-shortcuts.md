---
'gesso-core': patch
---

A shortcut written as Shift and a digit, `Shift+1`, matches the 1 key pressed with Shift, whatever character the layout types there: on a US keyboard that is `!`, which it never matched. `UiShortcutRegistry.handleKey` takes the press's physical key code to tell, and the `shortcuts` modifier passes it.

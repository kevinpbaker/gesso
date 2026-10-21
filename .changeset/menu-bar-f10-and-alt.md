---
'gesso-components': patch
---

A `MenuBar` can be reached from anywhere in the application, not only by tabbing to it. F10 moves focus to the bar, on the title it was last left on, and F10 again, Escape on the closed bar or choosing a command puts focus back on the control that had it. Alt pressed and released with no other key between does the same, and Alt with a menu's mnemonic opens that menu from wherever focus is, as in a Windows application. The keys are heard after the focused control has had them, so a control that binds F10 or an Alt chord keeps it, and Shift+F10 is left to context menus. Two new props turn them off for an application with its own use for them: `f10Key` (default true) and `altKey` (default true, except on macOS, where Option types characters and no such convention exists).

`menuBarStep` keeps the bar's focused title when Escape or Tab gives the keyboard back, and treats F10 as leaving the bar in one press, open or closed. Escape and Tab used to reset the bar to its first menu.

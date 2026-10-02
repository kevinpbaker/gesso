---
'gesso-core': patch
---

Shortcuts can bind the space bar. `shortcut({ keys: 'Space', … })` never fired before: a shortcut string splits on whitespace, so the key can't be written as `' '`, and the name `Space` was kept as a literal key name that no press ever matched. `Space` (and `Spacebar`) now mean the space bar, with any modifiers, and `formatShortcut` prints it back as `Space`.

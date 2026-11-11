---
'gesso-components': patch
---

A `MenuBar`'s titles are menu items now, named and marked `expanded` or `collapsed`, as the menubar pattern has them. They were rows with no role, so a screen reader read them as text and an agent's `ui_press` could not open a menu.

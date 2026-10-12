---
'gesso-components': patch
---

`Tooltip`, `Button`, `Link`, `Alert`, `Card`, `Toolbar` and a tab panel follow their children. A component runs once, but its parent can draw it again in place, as a `LazyList` does with a row whose data changed, and its new children then arrive on the same component; each of these read its children once, at mount, and kept showing the first. A count wrapped in a `Tooltip` in a list's row said 0 over eighteen while the row's own text beside it was right.

---
'gesso-components': patch
---

A `Select` with more options than the window has room for fits on screen. Its open list had no height to keep to, so fifty countries ran past the top and bottom of the window and End highlighted an option nobody could see. The list is now cut to the room the window has and scrolls, the way a `Menu` does, and keeps the highlighted option in view as the arrows, Home, End or a letter move it, opening scrolled to the chosen one. The chosen option is also ticked, in the column `Combobox` and `Menu` keep for theirs, so it still shows once the highlight has moved off it.

A `Combobox` option whose label is longer than its list is cut short with an ellipsis inside the list, rather than running past its edge and pushing its tick out after it.

---
'gesso-components': patch
---

`Select` type-ahead is a search now, as in WAI-ARIA's listbox. Characters typed within half a second of each other are one search, so `b` then `l` reaches Blueberry past Banana, and a space in the middle of one is part of it, so "new z" reaches New Zealand. Typing the same letter again walks the options starting with it, from the current one and wrapping. It used to be one character matched from the top every time, so the second of two options sharing a first letter could only be reached with the arrows. Disabled options are still skipped. Closed, a search still changes the value without opening the list; open, it moves the highlight and Enter takes it.

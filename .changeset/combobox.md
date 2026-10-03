---
'gesso-components': minor
---

`Combobox`: a value chosen by typing, a text field that filters a list. One value by default, several with `multiple` (each choice toggles one, the list stays open, chosen values sit in the field before its text, with remove buttons, and Backspace in the empty field takes the last off). Matches rank a label's start, then a word's start, then anywhere, then a keyword; `filterCombobox` is the same ranking, exported. Focus stays in the field while the highlight walks the list, which the field names as its `activeDescendant` so a screen reader follows it, and the list scrolls to keep the highlight in view.

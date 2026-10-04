---
'gesso-core': patch
---

Two ways to show a shortcut besides `formatShortcut`, for a help sheet. `shortcutKeyCaps(steps)` gives the keys one string at a time, one array per press (`[['⇧', '⌘', 'K']]` on a Mac, `[['Ctrl', 'Shift', 'K']]` elsewhere), to draw as key caps; they are the pieces `formatShortcut` joins. `describeShortcut(steps)` says it in words a screen reader reads out (`Shift Command K`, `Down arrow`, `Question mark`, `g then d`), since a cap's symbols are read inconsistently and punctuation is skipped.

---
'gesso-core': patch
---

A press in a field places the caret by the layout the press landed on. The offset is read before the press moves focus, so a field that draws itself differently once focused (one that shows hidden runs, or restyles its text) puts the caret where the person pressed in what they saw, not at the same x in the new layout.

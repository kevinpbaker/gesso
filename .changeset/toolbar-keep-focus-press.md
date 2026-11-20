---
'gesso-components': patch
---

`Toolbar` with `keepFocus`: a mouse press now chooses the tool, and opens ⋯, on the press itself. A press whose default is prevented is followed by no click, so tools did nothing under the mouse. ⋯ keeps focus where it was too. `onFocusChange` says when focus comes into the toolbar, its ⋯ menu included, and when it leaves, for a panel that stays open while its own controls have focus.

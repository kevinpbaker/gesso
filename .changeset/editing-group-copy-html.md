---
'gesso-core': minor
'gesso-framework': minor
---

A copy can put HTML on the clipboard beside the text. An editing group's new `copyHtml(start, end)` gives it, for a selection across fields or inside one field of the group, and `EditingState.html` carries it to the shell, whose copy and cut set `text/html` as well as `text/plain`. A rich editor's copy into a document or an email keeps its formatting. What a group makes of a selection is kept until the selection or its text changes, so `copyText` and `copyHtml` are no longer asked every frame.

---
'gesso-components': patch
---

`RichTextView` keeps a list's marker at its width: beside an item that wrapped it shrank to its glyph, so a wrapping item began further left than one that fit on a line.

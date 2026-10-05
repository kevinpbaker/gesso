---
'gesso-core': patch
---

Copying a selection over truncated text now copies the text the truncation hides, as a browser does with `text-overflow`. A `<text>` with `maxLines` or `textOverflow="ellipsis"` used to copy only the glyphs it drew, so a title shown as "Brand Story & Brand…" copied as "Brand Story & Brand".

A selection that stays inside the drawn glyphs still copies just those. One that reaches the end of a truncated line, onto the far half of the ellipsis or past the last glyph, copies through the end of the string, and so do select all, a selection that runs through a truncated node on its way to the next, and a triple click on the line. A double click on a word the ellipsis cuts takes the whole word. The ellipsis is highlighted whenever the selection includes text it hides.

`ParagraphGeometry` gains `source`, the whole text, and `sourceEnd`, the offset a selection may run to; `offsetAtPointIn` can answer `sourceEnd` and `selectionRectsIn` includes the ellipsis box for a range that reaches past `end`.

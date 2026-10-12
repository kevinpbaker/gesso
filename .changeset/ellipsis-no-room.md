---
'gesso-core': patch
---

A text with `textOverflow: 'ellipsis'` that has no room for even the ellipsis draws nothing, as a hidden overflow clips it in CSS. Squeezed to nothing beside other text (a folder's name after a long file name, in a row that shrinks it first), it drew whole, since a zero width is measured as no limit, or as an ellipsis wider than its box, over whatever came after it. Both renderers place text through `layoutTextLines`, so both agree.

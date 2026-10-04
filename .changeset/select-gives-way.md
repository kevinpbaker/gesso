---
'gesso-components': patch
---

A `Select` gives way in a row with less room than its value needs, as a text field does: its least width is nothing, and its value is cut short with an ellipsis before the chevron. Its value used to set its minimum width, so in a narrow row (a phone, or a window zoomed to 400%) a select showing a long value ran past the row's edge. A `minWidth` passed in still wins.

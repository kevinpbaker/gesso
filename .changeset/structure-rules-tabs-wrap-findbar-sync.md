---
'gesso-components': patch
---

A `Divider` is visible wherever it is put. A horizontal rule in a column that aligns its children to the start used to be zero wide and as tall as the column's spare height, and an upright rule in a row that centres its children, a `Toolbar`'s included, had no height at all. A rule now stretches across its parent and grows along it while staying one pixel thick, and a caller's own layout props win over those defaults.

Tabs and breadcrumbs no longer run off the side of whatever holds them. A `Tabs` strip with more tabs than room wraps onto further lines, so the selected tab is always on screen, and a long `Breadcrumb` trail wraps between crumbs, never leaving a separator at the start of a line. A `Tabs` panel whose tab was removed from `tabs` stops being named after it; the value itself is left for its owner to move, as `Pagination` leaves a page it did not choose.

`FindBar`'s field follows the find session, so closing a search and opening it again shows an empty field over "No results" instead of the old words. A bar that unmounts now clears the service's field only when that field is its own, so it no longer takes the caret away from another bar.

`Card` follows its `padding` as it changes, instead of keeping the first value. `Link`'s documentation now says what disabled does: Tab skips a disabled link, as it does every disabled control.

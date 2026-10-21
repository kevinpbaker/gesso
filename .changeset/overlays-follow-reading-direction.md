---
'gesso-framework': patch
'gesso-components': patch
---

Overlays follow the reading direction. An overlay entry's `placement`
now names `start` and `end` as reading edges: along the top or the
bottom, `-start` lines the entry up with the anchor's start edge, which
is its right under `textDirection="rtl"`, and the new sides `start`,
`end`, `start-start`, `start-end`, `end-start` and `end-end` open beside
the anchor toward those edges. `left` and `right` stay physical. An
unanchored entry takes `start` and `end` edge offsets beside `left` and
`right`. The direction is read from the entry's `environment`, or its
anchor, the same node its theme comes from, and followed while the
entry is open.

So under right-to-left text a `Toast` at `bottom-start` is pinned to the
bottom right corner and `bottom-end` to the bottom left; a `Menu` lines
up with its button's right edge, opens a context menu leftward from the
pointer, opens submenus to the left of their items (flipping right at
the window edge), and swaps Left and Right for opening and closing them;
`Combobox`, `DatePicker`, `Select` and `MenuBar` line their lists up
with the trigger's right edge; and `Tooltip` takes `start` and `end`
sides. Code that passed `bottom-start` to mean the left edge in a
right-to-left tree now gets the right edge.

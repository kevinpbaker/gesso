---
'gesso-core': patch
---

**A finger can scroll a surface on both of its axes.** `UiTouchScroller` picked one
axis per container from its flex direction, exactly as `UiWheelController` did
before it was fixed, and dropped the other. So a viewport whose content overflows
in both directions — a spreadsheet's, which is one `ScrollView` over content wider
and taller than itself — could not be dragged sideways at all.

Each axis is now asked separately whether the container has room, through a
`hasScrollRoom` the wheel and the touch paths share rather than write twice, so
the two cannot drift on which container takes a gesture. A fling coasts per axis
and each axis passes the threshold on its own, so a diagonal throw coasts on both
and a vertical one does not drift sideways by whatever the thumb happened to do.

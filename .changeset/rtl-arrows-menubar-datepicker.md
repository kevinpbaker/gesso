---
'gesso-components': patch
---

Arrow keys move toward the arrow pressed in a right-to-left `MenuBar`, `DatePicker` and collapsed `NavigationRail`. A bar's titles and a calendar's week run from the right under `textDirection: 'rtl'`, but Left still meant the previous title or the day before, so the ring moved away from the arrow; Left is now the next title and the day after there. A collapsed `NavigationRail` opens its labels on its end side, toward what it serves, rather than always on the right.

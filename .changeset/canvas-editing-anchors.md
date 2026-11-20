---
'gesso-components': minor
---

Canvas editing kit: what a drag snaps to is taken when it begins, so a shape that moves with what is dragged (a dimension glued to a corner) is never snapped to. A shape's `anchor` is the point a move snaps to the grid by, and `snap.gridOrigin` is where the grid's lines cross, so an application's numbers stay round. A handle can be `snaps: false`, dragged freely for a turning handle that steps by its own rule, and `look: 'none'`, drawn by the application. Every edit carries `modifiers`, whether Shift and Alt were held. `snapMove` and `snapPoint` take the same grid origin and anchor. Calcwright's whole drawing editor runs on the kit with these.

---
'gesso-components': minor
---

Canvas editing kit: while a point is dragged or drawn, Tab moves it to the next snap in reach and Shift+Tab to the one before, as in AutoCAD, for two snaps close together (a hole's centre and a tangent to it). `snap.candidates` gives the application's snaps in reach, best first; without it, Tab steps through the shapes' `snapPoints` in reach. `toPoint` and `candidates` are told `reach`, in canvas pixels at the zoom now (`CanvasSnapContext`).

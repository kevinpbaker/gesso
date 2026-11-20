---
'gesso-components': minor
---

Canvas editing kit: a `SnapHit` can carry a `label`, and the overlay writes it in small type beside the snap mark (`end`, `center`, `tangent`, `grid`), at the place nearest the mark that is clear of the readout. A `SnapTarget` can carry one too, and `snapPoint` and `snapMove` pass it to the hit. `CanvasOverlayState` takes an optional `snapLabel`, and `show` takes one for an application's own drags.

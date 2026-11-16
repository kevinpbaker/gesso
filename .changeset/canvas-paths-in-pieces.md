---
'gesso-core': patch
---

A painted path of many closed shapes draws in a few milliseconds on Canvas2D, where it took hundreds. Chrome's `closePath` costs as much as the path it closes is long, so a path of 5,000 holes (a perforated plate, a map's parcels, a scatter of markers) spent 60 to 140 ms in `closePath` alone, every frame it was drawn. Once a path has closed 64 shapes, the canvas target builds the rest of it in `Path2D` pieces of 16 closed shapes each and fills, strokes or clips the whole: the same path, drawn the same way. A path that closes fewer, a path drawn across a change of transform, and a host with no `Path2D` draw as before. Found by Gesso Cut, whose 5,000-hole plate panned at under five frames a second and now pans at sixty.

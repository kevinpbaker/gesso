---
'gesso-core': minor
'gesso-framework': minor
---

`rasterize` keeps what a subtree paints as pixels and copies them while only what is above it moves or scales: a design tool's frames under a zooming camera are one `drawImage` each, not every photograph and path drawn again. Canvas2D draws a kept subtree again when anything in it changes, and once a zoom settles at another scale, sharp; while the zoom moves it stretches what it has, redrawing only what fits the frame. `UiRenderer.nextRepaint` asks the runtime for that settling frame. Culling also goes through a transform that only moves and scales, so a zoomed-in camera draws only what is on screen; a node moved by its own transform is culled where it is drawn, not where its box is.

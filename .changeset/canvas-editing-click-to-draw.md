---
'gesso-components': minor
---

Canvas editing kit: `clickToDraw` lets a click begin a shape and the next press end it, with the shape following the pointer between; a drag still draws. `typedValue` takes a size typed while a shape is drawn or anything is dragged (`480`, `480<30`, `300,200`, `Ø100`): a digit opens the readout as a field, the application makes the edit exact from the text, and Enter ends it there. With shapes chosen, a typed value and an arrow move them by it. `commitTyped` commits a value from elsewhere, `typed` is the text being typed, and `handle.pointerUp` and `handle.pointerMove` say whether they began or moved a clicked shape.

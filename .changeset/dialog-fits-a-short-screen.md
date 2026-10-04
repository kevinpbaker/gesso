---
'gesso-components': patch
---

A `Dialog` taller than the screen now fits inside it, with 16 pixels to spare top and bottom, as a browser's modal `<dialog>` does: the title and description stay in view and the body scrolls what doesn't fit. Content that can shrink, such as a scroll view with a height and `minHeight: 0`, is given the room there is instead, and a focus ring at the body's edge isn't clipped. A tall form in a short window used to run off the top and the bottom.

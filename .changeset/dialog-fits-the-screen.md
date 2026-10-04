---
'gesso-components': patch
---

A `Dialog` wider than the screen now fits inside it, with 16 pixels to spare each side: `width` is the width it takes where there's room, and on a phone it narrows to the screen. A 520 pixel dialog on a 375 pixel phone used to run off both sides, title and all.

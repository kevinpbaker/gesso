---
'gesso-core': patch
---

The Canvas2D text measurer's width cache keeps the widths a screen is using. It held 8,192 widths and emptied itself completely when full, so a screen with more distinct runs than that (a long document, a table of thousands of cells) threw away the widths it was drawing with and measured them all again. It is now two generations of 4,096: a width found in the older one is carried forward, so one in use survives every turnover and one unused for a whole generation is dropped, in the same memory.

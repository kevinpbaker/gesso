---
'gesso-framework': patch
---

A window moved to a display of another density is redrawn sharp. Its size in CSS pixels does not change, so no resize was heard, and the canvas kept the old device pixel ratio, blurred or scaled, until something else resized it. Both app shells now listen for the ratio itself (`watchPixelRatio`).

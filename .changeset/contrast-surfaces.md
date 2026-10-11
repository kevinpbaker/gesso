---
'gesso-core': patch
---

`withContrast(theme, 'high', { surfaces })` and `highContrastColors(colors, { surfaces })` leave the names a custom palette says are grounds as they leave the stock ones. Every name a palette added was raised as a foreground against the page, so a code editor's selection or a diff's filled lines turned bright enough that what was drawn on them could not be read.

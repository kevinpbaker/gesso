---
'gesso-components': patch
---

`ColorPalette`: a `PaletteColor` takes `swatch`, what it is painted when its `value` is not itself a colour, so an app can offer colours it names its own way (a drawing's `blue`, drawn as its own blue). A recent colour the grid has is named and painted as the grid does it ("recent red", not "recent #ff0000"). `customLabel` names the "Custom colour…" row, for a page in US English. `Button` takes `onFocusChange`, told from its own focus and blur, as `InspectorSection`'s is.

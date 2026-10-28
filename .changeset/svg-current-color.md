---
'gesso-core': patch
---

An SVG drawn as a picture draws `currentColor` in the text colour it inherits, as its docs said, rather than always the theme's `text`: an icon set authored in `currentColor` takes the colour of the label beside it, white on a selected row. A painter may name `currentColor` too.

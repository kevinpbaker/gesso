---
'gesso-core': patch
---

Text that sets no `color` and no `textStyle`, and has none above it, is drawn in the theme's `text`. It was the default style's near-black, which is the light theme's text resolved once, so a plain `<text>` in a dark app or a dark dialog drew near-black on dark. The inherited colour now starts as the palette name `text`, looked up against the theme in scope where it is painted, as a `color` an ancestor sets already was. Found by Calcwright, whose keyboard-shortcut sheet showed blank keys in dark mode.

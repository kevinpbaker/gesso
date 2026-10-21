---
'gesso-components': patch
---

`ColorPicker` can pick an opacity. With the new `alpha` prop, a strip under the hue bar fades the colour into a checkerboard, and dragging or pressing it sets how opaque the colour is. It is a slider named "opacity" that reads its value as a percentage, and it takes the arrows like the square and the hue bar: 1% a press, 10% with Shift. The swatch beside the field shows the colour over the same checkerboard, the field takes `#rrggbbaa` and the `#rgba` shorthand as well as the six- and three-digit forms, and `onChange` always reports `#rrggbbaa`. A value without alpha is read as fully opaque. Without `alpha` the picker is exactly as it was: no strip, `#rrggbb` in and out, and an eight-digit value is still not a colour to it.

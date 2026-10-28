---
'gesso-core': minor
'gesso-framework': patch
---

A theme carries `units`, what an inch and a rem are worth in pixels: `{ pixelsPerInch: 96, rootFontSize: 16 }` on the stock themes, as in CSS. `lengths(theme.units)` gives `rem`, `inch`, `pt` and `mm` conversions to pixels, resolved where a value is written, so a theme can write its scales from the units it carries and a screen can write a print margin in millimetres or type in points. `themesEqual` compares the units. `UiTheme.units` is required, so a theme written without spreading a stock one has to add it. `tokens_view` reports the units, and tells an agent how to write a length in them.

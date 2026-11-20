---
'gesso-core': minor
---

`paintTextMetrics(value, style)` measures a line of painted text anywhere: in a painter, in a render worker, or in code that paints nothing, such as laying labels out or hit-testing them. It gives the width and the font's ascent and descent, in the font `PaintSurface.text` draws with, so a plate behind a label fits it and the label centres on it. `measurePaintText` is the width alone. Both were internal; Calcwright sized the pill beside a drag at 5.7 px a character, and Mockz at 6.4. A new docs page, Painting your own content, covers the paint prop, the surface, `inputs` and measuring.

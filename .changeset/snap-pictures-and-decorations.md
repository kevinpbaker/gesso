---
'gesso-core': patch
---

Pictures and decorations are painted on whole device pixels, as backgrounds, borders and clips already were. A picture at a fractional position was resampled across two pixels at each edge, so one shown at its own size still blurred, and its rounded clip sat a fraction away from the background it lies on. A decoration ring next to a crisp border straddled two pixels, and its band at 1.5x was one and a half device pixels. Both renderers now snap a picture's fitted rectangle, its clip, and a decoration's box through the same rule, and round a ring's band down to whole device pixels, never below one. As before, a node under its own scale or turn is left where layout put it.

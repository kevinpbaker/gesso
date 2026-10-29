---
'gesso-core': minor
'gesso-components': patch
---

Palettes gain `tooltipBackground` and `tooltipForeground`, and a tooltip is drawn in them. It used to be the control colours swapped round, which is dark on a light page but turned near-white on a dark one; both stock palettes now keep it dark, the dark one a step lighter than its panels. A custom `UiColors` needs the two names.

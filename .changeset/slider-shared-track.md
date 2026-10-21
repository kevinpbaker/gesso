---
'gesso-components': patch
---

`Slider` and `RangeSlider` now share one implementation of their track: how a press turns into a value, how a value is snapped and held in range, which way the track reads right to left, and where a thumb sits on it. Nothing a user sees or an application calls changes, but a fix to either control's track now reaches both, where before each carried its own copy.

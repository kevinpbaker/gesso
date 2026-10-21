---
'gesso-components': patch
---

A `Slider` with `thumb` set draws its thumb centred on the end of the fill at the top of the range, as it already did everywhere else. At the maximum the thumb overhangs the track by half its width, and the row holding it shrank the spacer before it to make room, so the thumb sat about six pixels short of the end of the fill it marks.

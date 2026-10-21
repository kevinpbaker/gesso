---
'gesso-core': patch
---

A text that names a type role keeps the reading direction an ancestor set with `textDirection`. Every component's labels name a role now, and a role was looked up whole, direction included, so inside a box set to read right to left a component mirrored its layout while its labels went back to reading left to right. A role is a size and a weight, not a direction, as `font` leaves `direction` alone in CSS; it still brings its own direction where nothing above set one, so a theme whose roles all read right to left mirrors a page from its root as before. The direction travels as a new environment key, `UiEnvironmentKeys.textDirection`.

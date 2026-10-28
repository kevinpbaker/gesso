---
'gesso-core': patch
---

`Responsive` builds once more at the first size measured, even when it falls in the same band as the zero before layout. A container whose real width shared a band with zero kept the arm built from zero, so a builder reading `size.width` (a 768-wide tablet testing `size.width < 600` inside `at={[1024]}`) was handed zero for good. `containerBands` emits that one extra value too. It costs one more build, once.

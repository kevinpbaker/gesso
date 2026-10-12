---
'gesso-core': patch
---

A hard line that fits whole is not broken. Line breaking added up its pieces' widths, which a font that kerns across a join ("grid-" and "test.ts") makes wider than the line measured whole, the width a box sized to its own text is given; such a line broke at the hyphen and drew "grid-…" with room to spare.

---
'gesso-core': patch
---

A row or column without a size of its own no longer comes out wider than the space it was given because a `flex: 1` child holds long content. It wrapped around that content's whole line, past its own maximum, and nothing flexed: in a fixed-size button, which centres its content, a long label was pushed off both edges and the first words of it were clipped. The container now stops at the space there is, and the flexible child takes what is left, wrapping or truncating its text there.

---
'gesso-core': patch
---

A lazy list's scroll no longer slows down as more rows are measured. Row offsets are kept in a Fenwick tree, so finding a row and recording a row's height cost the logarithm of the list's length rather than the number of rows measured so far: 2,000 scroll frames over 100,000 measured rows went from 7 seconds to 38 ms.

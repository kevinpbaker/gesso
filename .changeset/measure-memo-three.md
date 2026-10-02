---
'gesso-core': patch
---

Layout remembers three measurements per node instead of two. A row holding a flexible scroller of auto-height blocks asks each block three questions per pass: unbounded for the flex basis, at the final width, and at the stretched height. With room for two, every pass evicted one, so editing one block of a 1,000-block document re-measured all 6,005 nodes. It now re-measures under 20.

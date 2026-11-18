---
'gesso-framework': minor
---

`batch(run)` holds back every computed whose sources `run` changes until it ends, then works each out once, and a computed that follows them once after them. Moving every block of a long document down a page wrote each block's place in turn, and every computed that followed the places (the document as a file, its history, its pages) was worked out again for each one. Only computeds wait: a cell written in the batch has its value at once and its own subscribers hear it at once, a computed read inside the batch works out what is waiting first so it is never stale, and a batch inside a batch ends with the outer one. In Calcwright, an edit near the top of a 1,200-region worksheet that pushed the rest down did not finish in two minutes; with the push as one batch, run once a frame, it takes 0.4 seconds.

---
'gesso-testing': patch
---

`settle()` now waits for three turns in a row with no frame asked for before it calls the tree quiet. It returned after one quiet turn, so after a command to a channel served with `serveForTest` it sometimes returned before the patch came back, and the next query failed now and then.

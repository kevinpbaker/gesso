---
'gesso-framework': patch
---

A component no longer receives the same input value again when its parent re-renders. A prop built as a new Observable in the parent's render re-subscribed and replayed its current value, which re-ran every binding derived from that input even though nothing had changed. In a 2,868-block editor, inserting one block re-measured 12,912 nodes; it now re-measures 488. A changed value, or a new object, still arrives as before.

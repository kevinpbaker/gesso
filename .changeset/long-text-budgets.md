---
'gesso-core': patch
---

Editing a long field holds less memory: long paragraphs have a small cache budget of their own (eight paragraphs, half a million characters), and the memo of hard lines holds a million characters rather than two. 300 edits of a 100 KB field now keep 15 MB rather than 33 MB.

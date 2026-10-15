---
'gesso-core': patch
---

Typing into a long text field no longer grows memory without bound. The paragraph cache is bounded by the length of the text it holds as well as by count (now 16,384 paragraphs and a million characters), and the memo of a paragraph's hard lines no longer keeps every earlier version of the text alive. 4,096 edits to a 115 KB field used to keep 1.1 GB on the heap; they now keep 3 MB.

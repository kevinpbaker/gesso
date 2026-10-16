---
'gesso-core': patch
---

Typing into a long text field no longer pushes every label's laid-out paragraph out of the cache: paragraphs of 16K characters or more are remembered apart. The memo of a paragraph's hard lines is bounded by the length of the text it holds as well as by count, so a long line edited many times keeps about twenty versions rather than twenty thousand.

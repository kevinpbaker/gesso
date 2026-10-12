---
'gesso-core': patch
---

An empty lazy list laid out at no size, as one not shown yet is, no longer counts toward the warning that a list's viewport is the size of its content. Zero against zero said nothing about the list, but it was one of the two landings the warning waits for, so a single resize that happened to match the content later was enough to warn about a list that was bounded all along.

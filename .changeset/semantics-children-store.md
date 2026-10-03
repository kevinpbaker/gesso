---
'gesso-core': patch
'gesso-framework': patch
---

The runtime keeps the accessibility tree as records by id plus each record's children in order, and works out a record's index only when it sends that record or the tree is asked for. A structural change used to renumber every record after it and rebuild the whole tree's order, a pass over the whole document on every Enter in a long editor. An Enter in a 5,000-line document now spends about 3 ms on semantics where it spent 7 to 10. The structural rebuild goes through `rewalkSemantics`, and `SemanticsMemory` is what each walk leaves for the next.

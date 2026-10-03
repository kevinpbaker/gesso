---
'gesso-core': patch
'gesso-framework': patch
---

A change in the shape of the tree no longer rebuilds the whole accessibility tree, and no longer sends every later sibling an update. The tree is rebuilt from the nearest record above the change, and anything inside it that nothing touched is taken back as it was: renumbered if it moved, never described again, and a transparent subtree (a block of a long document) taken back as a run without being walked. Updates that only renumber a record whose siblings kept their order are no longer sent, since a mirror that applies removals and adds in order already has it in place: inserting a paragraph in a 5,000-line document sent 4,266 patches to the main thread, and now sends 2. `diffSemantics` gains a companion, `dropIndexShifts`.

---
'gesso-core': minor
'gesso-framework': minor
'gesso-components': minor
---

`Tour` walks a person through a screen one element at a time: everything but the element dims, through a rounded hole that follows it, and a card beside it explains it, with Back, Next and a count. Steps point at a `tourTarget()` given to the element as its `ref`. Underneath, an anchored node or overlay entry can be placed `over` its anchor, at the anchor's size grown by the offset, and such an entry leaves presses on the rest of the anchor to the anchor.

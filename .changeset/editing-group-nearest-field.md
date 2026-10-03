---
'gesso-core': minor
---

A press inside an editing group that lands on none of its fields (its padding, the gap between two fields, a list item's bullet) goes to the nearest field by height, with the caret at the nearest position, as a document does. A press on something that answers presses itself, a button or anything with a click or pointer listener, is left to it. `UiEditingController.fieldNear` is the lookup.

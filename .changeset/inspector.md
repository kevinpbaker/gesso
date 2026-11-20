---
'gesso-components': minor
---

The pieces of a property inspector. `InspectorSection` is a heading that folds the rows under it, and `InspectorRow` is a label and its value, the labels in one column so a section's values line up. `UnitField` is a number with a unit: typed (in another unit it knows too, `2 in` in a field in mm), stepped with the arrows (Shift ten, Alt a tenth) or scrubbed by dragging its label, live through `onChange` and committed once through `onCommit`. `mixed` shows `Mixed` for a selection whose values differ, and `onNudge` reports how far an arrow or a scrub moved instead of a value, so each chosen thing moves from its own, or a formula `b/2` scrubbed by 20 becomes `b/2+20`. `sharedValue(values)` is the value several things share, or mixed. Calcwright, Mockz and Flatwright each built these by hand.

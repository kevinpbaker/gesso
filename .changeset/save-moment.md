---
'gesso-framework': minor
'gesso-components': patch
---

What a design tool needs to save a moment of a played screen: `liveInput(name, read)` says what a component holds now, `controlled` and `ScrollArea` say it, and the inspector reports it as an owner's `live`. `StartingInputs` takes a list per name for each instance in the order made, a started input is the parent's again once the parent passes something new, and nested, the outer one wins input by input.

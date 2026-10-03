---
'gesso-framework': minor
---

`ScrollService.scrollIntoView(node, padding?)` scrolls the containers above a node until it's in view, for a component whose highlight moves without focus: a combobox walking its list while the caret stays in the field, a grid's cursor. Focus moved from the keyboard already did this; a highlight had no way to.

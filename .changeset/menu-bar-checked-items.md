---
'gesso-components': patch
---

`MenuBar` takes `checkedOf`, for commands that are settings rather than actions. True draws a tick beside the label and false leaves its place empty; a menu with any setting in it keeps the tick column on every row so labels stay aligned. Those rows are `menuitemcheckbox` with the `checked` state, so a screen reader says whether the setting is on. Undefined, or no `checkedOf` at all, keeps a plain `menuitem` as before.

---
'gesso-core': patch
---

A hidden (`visible={false}`) or disabled subtree has no Tab stops and refuses focus, as `display: none` and a disabled fieldset do in a page. Only the node's own `visible` and `disabled` were checked, so the buttons of a toolbar hidden until something was selected were Tab stops nobody could see, and a screen reader heard nothing at them.

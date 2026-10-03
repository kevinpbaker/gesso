---
'gesso-core': minor
'gesso-framework': minor
---

`activeDescendant` names the node that's active while another keeps focus, such as the highlighted option of a combobox whose field holds the caret, or the cell a grid's cursor is on. The semantics record carries it as the node's id, and the accessibility mirror writes `aria-activedescendant` from it, both on the node's element and on the editing proxy while a field has focus. Every mirrored element now has a DOM id for it to point at. The proxy also says `aria-expanded` for a field whose record is expanded or collapsed.

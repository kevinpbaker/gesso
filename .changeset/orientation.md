---
'gesso-core': patch
'gesso-framework': patch
---

`orientation` says which way a tablist, toolbar, list or separator runs when it is not the way its role assumes, and the semantics mirror sets `aria-orientation` from it. A column of tabs, as an activity bar is, was announced as horizontal, so a screen reader told its user to press Left and Right; with `orientation: 'vertical'` it says Up and Down.

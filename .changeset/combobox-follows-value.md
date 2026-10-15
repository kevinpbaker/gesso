---
'gesso-components': patch
---

`Combobox` shows a value the application changes while it has focus but nobody is typing in it. Focus alone held the old label, so a picker whose value was changed from elsewhere, just after a choice in it, said the old choice until it lost focus. A search under way is still left alone.

---
'gesso-components': minor
---

`SplitPane` takes `show`: `'both'` (the default), or `'first'` or `'second'` to put one pane on the whole container. The other is hidden, not unmounted, so its scroll, focus, drafts and any dialog it opened are still there when it comes back. An app that swapped a split for a single pane on a narrow window, or when its sidebar was put away, had to build the page again, which closed a dialog open over it.

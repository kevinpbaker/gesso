---
'gesso-framework': minor
---

`ShellService.contrast` reports the platform's contrast preference: `high` while the person has asked for more contrast (`prefers-contrast: more`) or turned on forced colours (Windows' contrast themes, which a canvas doesn't get from the browser), `standard` otherwise. Reported once at start and on every change, by both the worker and the single-thread shell. `withContrast(theme, contrast)` is the theme that answers it.

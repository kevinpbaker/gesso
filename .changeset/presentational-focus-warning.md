---
'gesso-core': patch
---

A focusable node inside a role whose children are presentational (a button inside a button) is warned of, once, in the console. ARIA hides it, so it has no record in the mirror and Tab stops on it in silence; nothing said so until a Tab walk found the silence.

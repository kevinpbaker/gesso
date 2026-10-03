---
'gesso-core': minor
---

A shortcut prints the way the platform writes its own: `⇧⌘K` on a Mac and `Ctrl+Shift+K` elsewhere, in `formatShortcut` and every binding's `display`. It printed `Ctrl` everywhere, on the grounds that the render worker couldn't see the platform; it can, from the user agent, and the editing keys already follow it. `formatShortcut(steps, platform)` prints for a platform of the caller's choosing.

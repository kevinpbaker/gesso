---
'gesso-framework': minor
'gesso-components': patch
---

`OverlayScope` gives a part of the tree overlays of its own: a dialog, menu or tooltip opened inside it is drawn inside it, dimmed, centred, placed, clipped and transformed with it, and what is outside stays pressable. `useOverlay` opens in the nearest scope, or the runtime's layer outside every scope. For a screen played inside another tool.

---
'gesso-components': minor
---

Canvas editing kit: `focusRing` draws a ring round the canvas while it has the keyboard, after a click as well as after Tab, and none while a field beside it has it, so it is always clear where the next key goes. `CanvasEditor` takes it as a prop. A canvas built on `canvasEditing` calls the new `handlers.onFocus` and `handlers.onBlur` from its focusable node, and `focused` says whether it has the keyboard.

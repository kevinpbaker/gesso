---
'gesso-components': patch
---

`UnitField` and `InspectorSection` take `onFocusChange`, told from the control's own focus and blur, so moving focus from one control to the next is told as this one's blur before the next one's focus. A focus event does not bubble, so a box round the control could not hear it, and Calcwright's inspector closed its diagram when a unit field took focus.

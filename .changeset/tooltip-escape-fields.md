---
'gesso-components': patch
---

Escape in a text field reaches the field when a tooltip is open over it. Since 0.6.27 an open tooltip took Escape for itself, so in a field whose focus opened its tooltip, cancelling an edit took two presses and the first only closed the tooltip. The tooltip still closes on that Escape; the field now hears it as well.

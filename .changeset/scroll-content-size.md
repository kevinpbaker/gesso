---
'gesso-core': patch
---

A scroll view with no size of its own along the axis it scrolls is its content's size, within its bounds, as the docs said and CSS does. A loose bound such as its own `maxHeight` was taken as its size, so a dropdown list capped at 280 pixels was 280 pixels of mostly empty panel when it held two options. A tight bound (a flexed or stretched size) still sizes it.

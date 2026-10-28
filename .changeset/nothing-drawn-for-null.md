---
'gesso-core': patch
---

A component that returns `null`, or a list of children holding `null`, `undefined` or a boolean (`cond && child`), draws nothing there instead of throwing "Cannot read properties of null". The types still say `UiChild`; code written without them (a design tool's mock in a `.jsx` file) is what this is for.

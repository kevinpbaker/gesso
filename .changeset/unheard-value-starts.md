---
'gesso-framework': minor
'gesso-components': minor
---

A control handed a value and no `onChange` now starts at that value and changes when it is used, as it would with `defaultValue`. A new value from the parent starts it again. Before, it stayed where it was until the application moved it. A screen written as a picture of a moment, `<Switch checked={true} />`, is now one a person can use, and a component of your own that goes through `controlled()` gets the same behavior. A control that only the application may change should say so with `readOnly` or `disabled`. A control whose `onChange` declines a change is unchanged: it still shows what the application writes back. So is a `Drawer` whose owner listens only through `onClose`. A component of your own with a second output like that names it in `controlled()`'s new `heardBy`.

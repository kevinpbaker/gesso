---
'gesso-components': patch
'gesso-framework': minor
---

A tooltip opens for focus the keyboard can see and not for the focus a press gives, so clicking a button no longer leaves its tooltip over whatever the click opened. A tooltip whose element is removed closes with it, even while the component that rendered the element stays, as when a Run button turns into Cancel. The `Tooltip` component now follows keyboard focus anywhere inside its wrapper, which it could not before because a focus event does not bubble. `FocusService.focusVisible` says whether the focus held is focus the keyboard can see.

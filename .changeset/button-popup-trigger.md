---
'gesso-components': patch
---

`Button` can be the trigger of a popup. It takes `expanded`, announced as expanded or collapsed as it changes, and `controls`, the node it opens, such as a `Popover`'s panel from `panelRef`. A button given neither says neither, so an ordinary button is not announced as collapsed. A popover's trigger used to have to be a raw `<button>` element to say what it opened; the Popover page and its example now use `Button`.

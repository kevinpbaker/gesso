---
'gesso-components': patch
---

A `MenuBar`'s titles follow its `menus`: a menu added, taken away or renamed after the bar is built gets its title, and opens. The bar used to build its titles from the first value only, and warned that it had read `menus` with `.value`.

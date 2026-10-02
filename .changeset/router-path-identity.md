---
'gesso-framework': patch
---

`router.params(route)`, `router.observeParams(route)` and `router.isActive(route)` now recognise a route by its path as well as by identity. Under Vite's dev server, a route table that imports its screens, with screens that import the table, could load twice after a hot edit. The screens then held route objects the router had never seen, and every param read `null`, so a page for one team silently showed the default team.

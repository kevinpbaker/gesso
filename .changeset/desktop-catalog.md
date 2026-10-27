---
'gesso-vite-plugin': patch
'gesso-electrobun': patch
---

The component catalog can be served from a desktop app's main process. `gesso-vite-plugin/catalog` carries it without Vite: `openCatalog({ root, fs })` reads the project's components with the checker and watches `root` with the `fs` it is given, so a component saved in a new file is in the next answer, and answers null when TypeScript 7 is not installed. `serveDesktopAgent` takes it as `catalog` and offers `library_overview`, `library_search` and `library_get` after the channels and the screen, with the catalog's instructions added to the app's, so an agent designing in a desktop app builds with the project's own components.

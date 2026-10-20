---
'gesso-vite-plugin': patch
---

Saving the module a render worker's route table comes from reloads the page instead of half replacing it. When `renderRoot(App).useRoutes(ROUTES)` imported `ROUTES` from the same module as `App`, the plugin hot-replaced that module, and the new `App` was drawn over routes that still resolved the old screens: a page that showed some of a change and not the rest, with nothing to say why. Routes are read once when the runtime is built, so the plugin now leaves such an entry unwired, warns why, and the save reloads. Keep the route table in a module of its own to keep hot replacement for the rest of the app.

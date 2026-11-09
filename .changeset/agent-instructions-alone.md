---
'gesso-vite-plugin': patch
---

`agentInstructions` reaches an agent with `catalog: false` too. The dev server only told an agent the application's own instructions alongside the catalog's, so an application that turned the catalog off had its instructions dropped.

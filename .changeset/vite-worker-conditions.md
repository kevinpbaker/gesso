---
'gesso-vite-plugin': patch
---

Dependencies resolve their `worker` build ahead of their `browser` one. Application code runs in workers, and a package's browser build may reach for `document`: every markdown parser built on micromark imports `decode-named-character-reference`, whose browser build does, and a render worker that imported one died on start with "document is not defined". Pass `workerConditions: false` to resolve as Vite does by default.

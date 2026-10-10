---
'gesso-framework': minor
'gesso-vite-plugin': minor
'create-gesso-app': patch
---

A channel's view may hold a `SharedArrayBuffer`. It is a handle on memory, so reference equality is the right comparison for it, and posted to another thread it is shared rather than copied: the app worker and the render worker can read one large document without sending it, and what changes is a small plain value saying which version to read. It needs a cross-origin isolated page. A desktop window's channels refuse it by name rather than sending `{}`, an agent is shown its size, and `gesso-vite-plugin` describes it in a view's schema instead of warning. A command still may not take one from an agent.

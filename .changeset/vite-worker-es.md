---
'gesso-vite-plugin': patch
---

Workers are built as ES modules, matching the module workers the plugin constructs, so a dynamic import in a worker becomes a chunk loaded when it runs instead of being inlined into the worker. Vite's default, IIFE, cannot split. An application that sets `worker.format` keeps its choice.

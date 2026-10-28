---
'gesso-vite-plugin': patch
---

The component catalog reads a project's components through the tsconfig it was given, not whichever one sits beside them, and keeps working when a tsconfig it had seen is deleted while the dev server runs: TypeScript refusing the update is a fresh checker, and a failed read is a warning and an empty catalog, never an unhandled rejection that ended the server.

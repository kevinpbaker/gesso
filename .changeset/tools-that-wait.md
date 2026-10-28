---
'gesso-framework': minor
'gesso-vite-plugin': patch
---

An application's agent tool can say it waits on purpose, for a person or for its next task, with `waitsUpToMs`: it is listed under MCP's `_meta` as `gesso/waitsUpToMs` (`WAITS_UP_TO`), and the bridges between the agent and the thread, the dev server's and the render worker's, give a call of it that long, where they gave up on every call after two minutes.

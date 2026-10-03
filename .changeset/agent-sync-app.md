---
'gesso-framework': minor
'gesso-vite-plugin': minor
---

A single-thread app can be driven by an AI agent too. `createSyncApp(...)` builders now answer `openRenderPort('gesso:agent')` from the page, with the channels fed there, whatever their channel workers serve, and the screen tools, so the dev server endpoint and WebMCP work exactly as they do for `createApp`. `useWebMcp(true | false | { confirm })` is the builder's form of `createApp({ webmcp })`. In a dev server, `gesso-vite-plugin` now hands a `createSyncApp` builder to the agent bridge and turns WebMCP on unless the app's own `useWebMcp(false)` says otherwise. The screen tools run a pending frame after each action on the main thread as they do in the render worker, so a background tab still reports what changed. `serveApplicationAgent` in `gesso-framework/agent` is the assembly both configurations share.

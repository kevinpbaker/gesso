---
'gesso-framework': minor
'gesso-vite-plugin': minor
'create-gesso-app': patch
---

`createApp({ webmcp: true })` offers an application's channels to an AI agent in the browser through WebMCP. Once the app mounts, every tool the agent surface offers, a view tool per channel and a tool per command, is registered with `document.modelContext.registerTool` (or the older `navigator.modelContext`), and removed when the app is disposed. View tools carry `readOnlyHint`, `@destructive` commands carry `consequentialHint`, a call answers with the view it left or rejects with the sentence that says why, and a `@confirm` command is put to the person with `window.confirm` unless `webmcp: { confirm }` supplies the application's own dialog. In a browser without WebMCP nothing is registered and nothing fails. The code loads on demand, so the shell is no bigger for an app that does not ask.

`gesso-framework/agent` adds `registerWebMcpTools`, `connectWebMcp`, `pageModelContext` and `confirmInWindow`. `gesso-vite-plugin` turns `webmcp` on in a dev server; the app's own setting still decides.

---
'gesso-vite-plugin': patch
---

`agentPath` serves the dev server's MCP endpoint at a path of the application's own, such as `/__my-app/mcp`, and the lines the server prints give that address. `/__gesso/mcp` keeps answering too, so an agent connected before the path changed still reaches it. `createAgentBridge` takes the paths it answers as `paths`.

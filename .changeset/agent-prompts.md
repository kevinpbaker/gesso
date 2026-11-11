---
'gesso-framework': minor
'gesso-vite-plugin': minor
---

MCP prompts. `mcpHandler`, `handleMcpMessage` and `serveDesktopAgent` take `prompts`, and the Vite plugin `agentPrompts`: messages the application wrote, with `{{name}}` for each argument, which the person runs in their agent as slash commands. Answered by `prompts/list` and `prompts/get`, and the server says it has them as an agent connects. The dev server answers them itself, so they are offered before any page is open.

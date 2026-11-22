---
'gesso-framework': minor
'gesso-vite-plugin': minor
---

Agents can hear changes without asking. A surface may `watch` (`AgentSurfaceChange`: a resource changed, or the tools did); `agentSurface` and `combineSurfaces` do. `mcpHandler` then opens MCP's GET event stream for a session, answers `resources/subscribe` and `resources/unsubscribe`, sends `notifications/resources/updated` once per burst of changes to a subscribed view and `notifications/tools/list_changed` to every open stream, and says `subscribe` and `listChanged` in its capabilities; a surface that cannot watch still declines the stream with 405. The dev server's endpoint opens the same stream and says when a window with other tools connects.

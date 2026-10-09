---
'gesso-framework': patch
---

`mcpHandler` keeps sessions: `initialize` is answered with an `Mcp-Session-Id`, which remembers the client's `clientInfo`, and a new `around` option runs around every request with that caller (`McpCaller`), so an application can tell which agent asked. `DELETE` with the id ends a session. The bearer token is now compared in constant time.

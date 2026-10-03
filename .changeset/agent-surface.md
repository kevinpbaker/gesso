---
'gesso-framework': minor
---

`gesso-framework/agent` hands an application to an AI agent. `agentSurface(channels)` takes the same `{ token, source }` registrations an application already serves and offers each channel as a resource holding its view, a read-only `<channel>_view` tool, and a `<channel>_<command>` tool per command that sends it and returns the view once it has settled. Tool descriptions, input schemas and hints come from the schema `gesso-vite-plugin` writes from the contract's JSDoc; arguments that do not fit are refused with a sentence naming the field, `@hidden` commands are not offered, and `@confirm` commands are sent only once the `confirm` option says the person approved.

`mcpHandler(surface)` serves it over MCP's Streamable HTTP transport as a `fetch` handler, ready for `Bun.serve`, refusing unknown browser origins and optionally requiring a bearer token. `handleMcpMessage` is the same server without the transport, for stdio or a relay.

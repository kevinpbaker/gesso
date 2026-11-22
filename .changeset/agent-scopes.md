---
'gesso-framework': minor
'gesso-vite-plugin': minor
---

`mcpHandler` decides what each agent may do. `authorize(request)` returns an `AgentGrant` (`{ subject?, scopes }`) or null for a 401, and every tool says the scope it needs under `_meta['gesso/scope']`: `<channel>:read` for a view, a query or a view resource, `<channel>:write` for a command (which includes read), `screen` for `ui_*`, `design` for `tokens_view` and `render_frame`, and `app:read` or `app:write` for an app's own tools (`AgentToolDefinition.scope` overrides). `@scope name` on a command or query gives it its own; on the token, it names the channel's scopes. An agent is listed only what its grant holds, a call outside it gets HTTP 403 with `WWW-Authenticate: Bearer error="insufficient_scope"`, and `around` is told the grant. With `oauth: { resource, authorizationServers }`, a 401 points at the protected resource metadata (RFC 9728) that `mcpHandler` answers at `/.well-known/oauth-protected-resource`, also given by `protectedResourceMetadata`. `token` still works and grants every scope.

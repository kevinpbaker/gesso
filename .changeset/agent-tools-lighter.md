---
'gesso-framework': patch
---

A channel's command tools no longer carry the view's JSON Schema as `outputSchema`; the `<channel>_view` tool still does, and a command still returns the view as `structuredContent`. Repeating it on every command made the issue tracker's tool list about 200 KB, which an agent paid for in context before its first call. A command whose call leaves the view as it was now says so ("the view is the same as before"), where it used to answer as if it had done something, so an agent learns that an id it sent matched nothing.

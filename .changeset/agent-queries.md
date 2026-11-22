---
'gesso-framework': minor
'gesso-vite-plugin': minor
'create-gesso-app': patch
---

A channel can declare queries, functions that return data, so an AI agent can read what the view does not hold without changing the person's screen. Declare them as `queries: {} as { find(filter: IssueFilter): readonly IssueRow[] }` in `defineChannel` (or as the third type argument of `channel`), and answer them in `serve(token, { queries })` or `useChannel`'s `source`, with plain data or a promise of it. Each becomes a `<channel>_<query>` agent tool marked `readOnlyHint` and `idempotentHint`, described from its JSDoc and `@returns`; it answers with what the query returns and moves nothing on the screen. The Vite plugin writes `ChannelSchema.queries`, checks each answer is plain data, and counts undescribed queries in its agent-readiness warning. New types: `Query`, `QueriesOf`, `QueryHandlers`, `QuerySchema`. `AGENTS.md` in new projects says when to use one.

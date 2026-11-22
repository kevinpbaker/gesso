---
'gesso-framework': minor
'gesso-components': minor
'create-gesso-app': patch
---

What AI agents do to an app is written down and shown to the person. Every runtime has an `AgentActivityService`; the agent bridge records each call of a tool that can change something (a command, a screen action, an app's own tool that is not read-only) with the agent's name and what came of it (`changed`, `unchanged`, `declined`, `unasked`, `failed`), and leaves reads out. `gesso-components` adds `AgentActivityToast`, which says each burst of changes once the agent is quiet ("Claude Code made 9 changes: update ×8, create."), and new projects include it. `describeAgentActivity` writes that sentence for any run of entries, and `recordAgentActivity(surface, activity)` records a server's calls the same way. Tool results carry what came of them as `_meta['gesso/outcome']`.

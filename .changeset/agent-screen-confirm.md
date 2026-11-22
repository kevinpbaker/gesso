---
'gesso-core': minor
'gesso-framework': minor
'create-gesso-app': patch
---

The screen tools say they act as the person, and an application can mark a control an agent must not act on without the person's approval. `agentConfirm` on any element (a string is the question, `true` asks one written from the control's name, `false` lets a control inside a marked one through) puts an agent's `ui_press`, `ui_type` or acting `ui_key` on it, or on anything inside it, to the person first through the same `confirm` as a `@confirm` command, the app's own dialog included. The outline marks such a control `(asks the person first)`. A person's own clicks, and what is drawn and announced, are unchanged. `GessoRuntime.agentConfirmAt` answers which mark applies, and `uiSurface` takes `confirm`. New projects mark their Reset button.

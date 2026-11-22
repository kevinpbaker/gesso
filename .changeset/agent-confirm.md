---
'gesso-framework': minor
'gesso-components': minor
'gesso-vite-plugin': minor
'gesso-electrobun': minor
'create-gesso-app': minor
---

An AI agent's `@confirm` command is put to the person in their own words, on the app's own screen, and an agent can tell a no from nobody being asked.

- **Wording.** Text after the tag is the question, with `{parameter}` for an argument: `@confirm Delete the note {id}?`. For wording from the data, `serve(token, { confirm: { remove: id => ({ title, detail, action }) } })` (and `useChannel`'s `source`) words each command's question on the thread that owns the data. `AgentConfirmation` gains `question` and `agent`, the client's own name from MCP's `clientInfo`, which `mcpHandler` and the dev server now pass through.
- **In-app dialog.** `renderRoot(App).useAgentConfirm(ask)` (and the single-thread builder's) asks on the canvas before the page's `window.confirm`. `gesso-components` adds `agentConfirmDialog()`, drawn with `Dialog`, and new projects use it.
- **Answers.** `confirm` may answer `'approved' | 'declined' | 'unavailable'` or `{ unavailable: why }`, as well as a boolean. A hidden window, a browser that suppressed its dialog, an in-app question unanswered for `AGENT_CONFIRM_MS` (110 s) and an app with no way to ask now tell the agent that nobody could be asked and why, where they used to say the person declined or hold the call until it timed out.
- `messageBoxConfirm` in `gesso-electrobun` shows the question, its detail and which agent asks, with the question's own word on its button.

---
'gesso-framework': minor
'gesso-vite-plugin': minor
---

An application can offer an agent tools of its own, beside its channels' and its screen's: `renderRoot(App).useAgentTools([...])`, and `useAgentTools` on the app builder. A tool is a name, a description, an input schema and a `run` that may answer with text, data and pictures (`agentText`, `agentImages`, `agentError` from `gesso-framework/agent`); its arguments are checked against the schema first. In `gesso-vite-plugin`, `agentInstructions` adds an application's own words to what an agent is told when it connects, and `catalog.exclude` leaves folders of generated code out of the component catalog, so they are not counted as uses.

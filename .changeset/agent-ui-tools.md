---
'gesso-framework': minor
'create-gesso-app': patch
---

An agent can operate the interface, not only the channels. Beside the channel tools, the page now offers `ui_snapshot`, the screen as an outline of what a screen reader announces with a short ref per control, and `ui_press`, `ui_type`, `ui_focus` and `ui_key`, which act on a control named by ref or by role and name and answer with the outline afterwards. They go through the accessibility mirror's own path, so a press is a click, a value is a keyboard edit, a disabled control refuses, and a focus trap holds. Available in the dev server endpoint and through WebMCP. `GessoRuntime.focusedNodeId()` reports which node holds focus.

The dev bridge also announces the page again whenever its HMR socket reconnects, so a restarted dev server no longer tells an agent that no page is open while one is.

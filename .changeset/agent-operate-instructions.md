---
'gesso-framework': minor
'gesso-vite-plugin': minor
---

An agent is told how to operate a Gesso app when it connects: read a channel's `_view` first, a command answers with the view after it, a read-only query reads without moving the person's screen, and `ui_snapshot` with the screen tools covers the rest. `handleMcpMessage` adds `OPERATE_INSTRUCTIONS` after the application's own `instructions`; `operate: false` leaves it out. The dev server answers `initialize` under the name it printed (`agentName`, else the project's folder) before a page connects and after, where it said `gesso` and then the page's title, and it no longer refuses an agent's handshake before any page has opened.

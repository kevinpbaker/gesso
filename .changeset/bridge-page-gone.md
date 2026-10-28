---
'gesso-vite-plugin': patch
---

A call the dev server's agent bridge sent to a page that then closed or reloaded is answered at once, saying the page closed and to call again, rather than left to time out; a tool that waits on purpose would otherwise have kept the agent waiting for its whole wait.

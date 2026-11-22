---
'gesso-vite-plugin': minor
---

An agent can choose which window of the app answers it. The newest window still answers by default; while more than one is open, the dev server's endpoint lists `windows_list`, which numbers the open windows with their titles and addresses, and `windows_use`, which sends that agent's calls to the window it names until the window closes. Other agents are unaffected, and the tools list says when the window tools come and go.

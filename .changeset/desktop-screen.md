---
'gesso-electrobun': patch
---

A desktop window's screen tools can be offered to agents beside its channels: `relayScreenAgent` (`gesso-electrobun/view`) relays the render worker's agent port over the window's RPC, `createScreenAgent` (`gesso-electrobun/desktop`) holds the other end, and `serveDesktopAgent` takes it as `screen`. Only the screen tools cross. Meant for development, since pressing the screen's buttons is everything the person can do.

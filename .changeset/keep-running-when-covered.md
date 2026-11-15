---
'gesso-electrobun': minor
---

`keepRunningWhenCovered(window.webview.ptr, ffi)` from `gesso-electrobun/desktop` keeps a window's page running while other windows cover it, on macOS. WebKit took a covered window's page for a hidden one and stopped it after four minutes, so an agent working while the person was in their AI app got no answer from the window (its screen tools, or its own channels) until the window was brought forward, and the window was blank when it was. It turns WebKit's occlusion detection off for the web view, through `bun:ffi`, which the caller passes. A minimized window, or an app hidden with ⌘H, still stops.

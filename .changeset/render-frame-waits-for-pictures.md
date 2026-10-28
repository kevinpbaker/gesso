---
'gesso-core': patch
'gesso-framework': patch
---

`renderFrame` waits for a picture still being fetched or decoded before it draws, rather than taking the tree's quiet for finished: a large image could arrive after the frame was drawn, leaving it out. `mediaLoadsInFlight()` says how many pictures the media modifiers in this thread are still loading.

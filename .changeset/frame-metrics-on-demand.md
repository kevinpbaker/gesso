---
'gesso-framework': patch
'gesso-devtools': patch
---

A render worker no longer posts its frame metrics to the main thread when nothing there listens. Each `frame` message is a structured clone of nested timing objects, sent every frame, and a `createApp` without `onFrame` dropped every one of them. The shell now says in `init` whether it wants them (`frameMetrics`), and the devtools tap asks for them itself, since its action log closes each entry on one.

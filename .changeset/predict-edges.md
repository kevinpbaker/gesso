---
'gesso-core': patch
---

A predicted trackpad flick no longer springs off an edge it runs into, or steps back as it slows: room is judged from where the steps have really taken the container, each frame sets a clamped position, and a frame never moves against the latest step.

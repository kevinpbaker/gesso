---
'gesso-core': patch
---

The WebGPU renderer no longer allocates a copy of the whole instance buffer on every frame that changes. It kept a fresh copy of the last frame's instance data to skip uploads that would change nothing; it now keeps one buffer across frames, grown only when a frame needs more, and writes the frame into it. The view uniform is reused the same way.

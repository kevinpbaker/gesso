---
'gesso-core': patch
'gesso-framework': patch
---

A notched mouse wheel scrolls without stalling. Each notch retargets the scroll's spring, and the new spring used to spend its first frame standing still where the old one stopped: a one-frame freeze at every notch, and a scroll that barely moved while a wheel was spun fast. A spring that takes over from a running one now continues its clock as well as its velocity (`UiAnimation.continueFrom`), so it moves on its first frame.

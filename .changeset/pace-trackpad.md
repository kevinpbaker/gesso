---
'gesso-core': minor
'gesso-framework': patch
---

A precision device's wheel steps are paced over frames. A trackpad sends on its own clock, so a frame got one, two or three of its steps and a steady flick moved unevenly; the runtime now moves each frame by the rate the steps have been arriving at, never more than a frame behind, and applies the rest when the input stops. `UiWheelController` takes a `pace` option and an `advance()` a host calls once a frame; the runtime turns it on.

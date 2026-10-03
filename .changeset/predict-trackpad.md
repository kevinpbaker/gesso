---
'gesso-core': patch
'gesso-framework': patch
---

A precision device's scroll is predicted to the frame rather than paced behind it. Each frame puts the page where the input will have reached when the frame is shown, from the steps' velocity and their timestamps, which the shells now pass with each wheel event; the page stays as even as pacing made it without trailing the hand by a frame. `UiWheelController.wheel` takes the event's time, and `advance` the frame's.

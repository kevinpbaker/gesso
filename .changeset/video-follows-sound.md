---
'gesso-core': patch
'gesso-framework': patch
---

A video on a clock now stays with it while it plays. Before, the picture ran on its own tween and met the clock only when it started, stopped, seeked or changed rate, so over a long clip it moved away from the sound. Now each frame the picture presents is checked against the clock, and when the two are more than 80 ms apart the picture goes back to the clock. A gap of more than half the clip is a lap, not a drift, and is left alone. `audioClock` now runs on between the positions `AudioService` writes ten times a second, up to 150 ms past the last one, so the picture checks against a smooth position and not a stepped one.

Audio requests made before a runtime has an audio listener now reach the first listener. A render worker installs its listener after the first render, so a component that loaded a track in its body sent the request nowhere. Up to 32 requests are held. A headless runtime that never listens still plays nothing.

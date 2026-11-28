---
'gesso-core': patch
'gesso-framework': patch
---

The controls on a video with sound now drive the sound. A `VideoClock` can have `play`, `pause` and `seek`, and when it has them the transport sends those calls to the clock instead of changing only the picture. `audioClock` has all three and sends them to `AudioService`. It keeps to its own source: a pause or a seek does not touch another source's playback, and a play on a clip whose sound was replaced loads it again from where the picture stopped. A play starts the picture only when the clock says it is running, so a sound that the browser blocks does not leave a silent clip running. A clock that starts after the clip has loaded now starts the picture; before, the picture stayed on its first frame. At its end, a clip on a clock holds its last frame and does not loop alone in silence.

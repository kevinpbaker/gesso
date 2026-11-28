---
'gesso-core': patch
'gesso-framework': patch
'gesso-components': patch
---

The rate, the loop and the volume of a video with sound now reach the sound. A `VideoClock` can have `setRate`, `setLoop` and `setVolume`. The clip gives them to the clock when it is ready and again each time the transport changes one. On a clock with `setLoop` the clip loops with its sound; on a clock without it the clip holds its last frame at the end. `audioClock` has all three and gives them to `AudioService` while its source is the one loaded, and again each time that source is loaded.

`AudioService` has `setRate` and `setLoop`, and `AudioState` has `rate`. The shell sends the element's rate in each sample, and the position moves on at that rate between samples. A `load` puts the rate back to 1 and the loop off, as a new source on an element does, and the load request now goes to the shell before the state changes, so a subscriber that answers the new source reaches the shell after it. `AudioRequest` has `rate` and `loop`, and `AudioElementLike` has `playbackRate` and `loop`.

`Video` draws its volume control when its `clock` has `setVolume`, as well as when it has `onVolume`.

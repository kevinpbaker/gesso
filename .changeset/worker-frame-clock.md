---
'gesso-core': patch
---

**The render worker asks the compositor itself.** `UiHostFrameClock`
was built on a premise that expired: that `requestAnimationFrame` is
tied to the compositor and exists only on the main thread, which is why
the shell ran a loop and forwarded a tick per refresh.

`DedicatedWorkerGlobalScope.requestAnimationFrame` has been in Chrome
since 69, Firefox since 99 and Safari since 16.4, which made it
baseline in March 2023. Measured in a render worker: a median interval
of 16.70ms with a range of 16.6 to 16.8, which is vsync and not a
timer. Its timestamps are on the worker's own `performance.now()`
timeline, so nothing needs translating.

Counting `requestAnimationFrame` calls on the main thread over three
seconds: **180 before, 0 after.** The shell is out of the frame path
entirely, and with it goes the part of the design that was least
defensible, that a worker's heartbeat depended on the thread the worker
exists to be independent of. A blocked page used to stop the render
worker's frames until a stall watch noticed.

The forwarded path stays, feature-detected, for an older browser and
for a nested worker on Chromium, which has no frame callback of its
own. The contract is the same either way. Both stop for a hidden tab,
which is not luck: a worker's animation frames are serviced by its
owner window's rendering, and a window that is not rendering services
none.

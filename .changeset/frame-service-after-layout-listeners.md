---
'gesso-framework': minor
---

`FrameService.afterLayoutListeners(run)` runs `run` once every layout listener of the frame being laid out has been told its box, before the frame is drawn, and what it changes is laid out in the same frame. The same function asked for again before it runs runs once. For work that follows many boxes together: Calcwright pushes a worksheet's regions apart as each is measured, and a long worksheet opening has hundreds measured in one frame. Done in each region's listener, the push ran once per region, and opening a 300-region worksheet took 17 seconds; done once after them all, it takes about one.

---
'gesso-framework': patch
---

`FrameMetrics.measured` and `relayoutRoots` are 0 for a frame that ran no layout. They used to repeat the last layout pass's numbers, so a caret blink or a scroll looked like a full re-measure to every profiler and proof panel that reads them.

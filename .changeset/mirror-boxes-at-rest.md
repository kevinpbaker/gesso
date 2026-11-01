---
'gesso-framework': patch
---

The accessibility mirror's boxes follow a pan or a zoom when it stops, not on every frame of it. The first frame of a run of moving frames sweeps every mirrored box as before; the frames after it send only the focused node's box, which the focus ring is drawn from, and the rest are swept once nothing has moved for 120 ms, or after a second of moving that never stops. In Atelier, a board of 36 screens panned at 15% spent 3 to 4 ms of each 4 to 6 ms frame sweeping the boxes and kept Chromium's main thread 62% busy writing them; it now spends 0.4 ms, and the main thread is 9% busy.

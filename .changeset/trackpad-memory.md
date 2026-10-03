---
'gesso-core': patch
---

A trackpad's steps are no longer smoothed one at a time. Chrome on a Mac reports a trackpad's legacy `wheelDeltaY` as three times its pixel delta, so a 40-pixel step looked like a mouse wheel's detent and was animated while the steps around it weren't, which stuttered a flick, most of all as it slowed. Once an event that doesn't look notched arrives, the wheel is taken to be precise while events keep coming.

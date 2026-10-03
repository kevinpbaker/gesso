---
'gesso-testing': minor
---

A frame that throws now fails the test: `renderTest`'s `frame()` and `settle()` throw the error from the frame that ran it, where before the frame was abandoned as it is in an application and the test went on against the last good picture. `allowFrameErrors: true` keeps the old behaviour for a test about that recovery.

---
'gesso-core': patch
---

A mouse wheel glides whatever legacy delta its notches report. A wheel step was animated only when its `wheelDeltaY` was a multiple of 120, and drivers, scroll settings and display scaling all change that number: a notch that failed the test landed in a single frame, as a jump. A large step (50 pixels or more) that starts a burst is now taken for a notch on its size, and the burst stays one while its steps stay large. A trackpad gesture starts with small steps, so it is still caught as precise and paced as before, and a dispatch with no legacy delta still lands at once.

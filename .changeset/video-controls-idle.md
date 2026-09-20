---
'gesso-components': patch
---

**The video controls take themselves away again.** They appeared on
hover and vanished the moment the pointer crossed the edge, which is
not what a player does and is wrong in both directions.

A pointer that entered and then stopped is not using the controls, so
the bar now goes after a second of stillness whether the pointer is
still inside the clip or long gone. A pointer that has just left is
very often coming straight back, and hiding the instant it crosses the
edge made the bar flicker under a hand reaching for it, so leaving
starts the same countdown rather than hiding at once.

Resting on the bar suspends the countdown entirely, and has to: a hand
held steady over a scrubber it is about to press is the stillest the
pointer ever is, and exactly when an idle timer would otherwise fire.

`hideAfterMs` sets the delay and defaults to a second. Zero keeps the
bar up until the pointer leaves, and `alwaysVisible` still pins it.

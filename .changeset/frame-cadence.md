---
'gesso-core': patch
---

**A 24fps clip played at 20 on a 60Hz display**, dropping one frame in
six, for ever, on the commonest clip rate there is.

An animation that declares `stepMs` is declaring a rate, and the driver
was treating it as a gap between samples. Frames arrive on the
display's refreshes, so a sample is nearly always served a little after
it was due; measuring the next step from when it was _served_ rounds
the period up to a whole refresh and then keeps the rounding. 41.67ms
wanted, the refresh at 33.3ms too early, the one at 50ms serves it, and
the next step measured from 50. The period is not 41.67ms but 50ms.

The ideal time now advances by exactly `stepMs`, so the served times
alternate between 33.3 and 50 and average out to the rate that was
asked for. A rate that divides the refresh exactly was never in
trouble, which is part of why this went unnoticed: 30fps on 60Hz was
always right.

Falling a whole step behind resynchronises rather than catching up. A
stall or a hidden tab leaves a backlog whose samples are, for a video,
pictures already past.

None of this touches a value. A tween's output has always been a pure
function of elapsed time, so nothing was shown at the wrong moment;
what was wrong is how often anything was shown at all, which no
assertion about values could have caught.

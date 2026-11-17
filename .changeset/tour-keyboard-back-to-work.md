---
'gesso-components': patch
---

A `Tour` that is not modal gives the keyboard to the card on every step, not only the first: the overlay keeps the card's node from step to step, so the card took it once and, after Next or Back, nothing had it. A step whose target holds the place the person last worked in gives the keyboard back there instead, so after typing on a step and pressing Next, by pointer or by key, the next keys go where they typed. Found by Calcwright, whose tutorials have the person type on the worksheet step after step.

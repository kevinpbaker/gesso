---
'gesso-core': patch
'gesso-framework': patch
---

A `transition` now animates what is drawn, whoever changed it: the element, or a modifier writing over it, so a press or hover that `interactive` draws eases in and out on an element that declares a transition for that property, as a CSS transition follows a `:hover`. A value written by another animation's frame (a `motion` state, an `AnimationService` tween) is let through rather than chased, and `InspectionService.preview` is drawn at once both ways. `AnimationDriver.isAdvancing` says whether a frame is being written.

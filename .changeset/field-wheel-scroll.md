---
'gesso-core': patch
---

**The wheel scrolls an editable that overflows.** A multiline field with a fixed
height, or an unwrapped one narrower than its line, followed the caret and
nothing else: a wheel over it did nothing. It now scrolls the field's text on
either axis, clamped where the caret-follow offset is and without moving the
caret, and a wheel the field has no room for chains to the scroll container
around it, as one from a scroll container's end does.

A multiline field also shows the overlay scrollbar a scroll container does,
fading when idle, revealed by hovering its edge, and draggable once it shows.
While hidden it takes no presses, so a click at the end of a line still places
the caret. A single-line field draws none.

`scrollRange(record, axis)` is the furthest a record can scroll, the one answer
the layout engine's clamp, the scrollbars and the scroll sinks now all read.

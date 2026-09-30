---
'gesso-core': patch
---

**`scrollWith`: a container that scrolls in step with another node.** Binding a
container's `scrollY` to what `scrollPosition` reports leaves it a frame behind,
because the report arrives after the frame is laid out. A line-number gutter
beside a field, or a row header beside a grid, has to line up on every frame.
`scrollWith` names the node to follow and `scrollWithAxis` the axes (`both` by
default); the follower takes the leader's effective offset in the same layout
pass that settles it, whatever moved the leader. It ignores its own offset on a
followed axis, shows no scrollbar, and passes a wheel over it to the leader. An
`overflow="hidden"` box that follows is scrolled all the same, as script scrolls
one in CSS.

`scrollPosition` on an `<editabletext>` reports how far the field has scrolled
its own text, from the wheel, its scrollbar, the caret or a clamp.

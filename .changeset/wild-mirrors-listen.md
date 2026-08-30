---
'@gesso/framework': minor
'@gesso/core': minor
---

An accessibility mirror: the shell now writes the semantics tree into an
off-screen DOM over the canvas, so a screen reader, an OS accessibility
API or an automated testing tool sees real elements where before it saw
one empty canvas.

`SemanticsMirror` is on by default in both configurations and opts out
with `accessibility: false`. Presses, focus moves and value sets from an
assistive technology come back as ordinary input through the focus
manager and the editing controller, and the focused text field stays
with F2's editing proxy — which now carries that field's role and label
rather than hiding itself.

`GessoRuntime.onSemantics` takes a `UiSemanticsUpdate` (patches, the
boxes that moved, and focus when it moved) instead of a patch list; it
had no consumer before this. `UiEditingController.replaceText` is new.

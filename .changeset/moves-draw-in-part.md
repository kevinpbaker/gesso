---
'gesso-core': patch
'gesso-framework': patch
---

A frame where a box moved is now drawn where the box was and where it is, instead of whole. `LayoutEngine.takeMoves` returns what moved since the last frame and where each node was drawn: a box written, a subtree shifted, a sticky node shifted, a transform changed, or a shadow that now reaches less far. The runtime hands this to the renderer as `RenderChanges.moved`. When something moved that it does not describe, such as a full layout or a node added or removed, the frame is still drawn whole. A turned or flipped node is now placed by the box that holds its corners, where before it made the frame whole. Where each lifted node was drawn is noted at the end of every frame, so a scroll, a transform or a move that carries one elsewhere draws over its old place too. Two kinds of frame benefit most: an endless transform animation, such as a spinner or a pulse, no longer draws the whole surface every frame, and neither does text that changes width. A shadow that shrinks also no longer leaves its old edge on the surface.

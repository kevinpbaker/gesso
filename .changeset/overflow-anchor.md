---
'gesso-core': minor
---

`overflowAnchor: 'none'`, as in CSS: a layout that moves the focused node leaves its scroll container's offset alone, so a node that keeps what it draws still by itself (a canvas that grows up or left) is not scrolled away. Set it on the focused node, a node above it, or the scroll container. `'auto'`, the default, keeps today's behavior, and `ScrollService.keepInPlace` holds are not affected.

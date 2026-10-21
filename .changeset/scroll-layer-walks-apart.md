---
'gesso-core': patch
---

Scrolling down a list with a sticky header no longer stutters at high refresh rates. A scroll layer repainted the strip a scroll exposed and the items something changed in one walk over everything between them, and a sticky header is damaged at the top on every frame while a scroll down exposes its strip at the bottom: that walk took in every row on screen, each one's text another copy for the GPU, all clipped away. On a 165Hz display that saturated the GPU and halved the frame rate going down, while going up, with the strip beside the header, stayed smooth. Strips far apart are now walked apart.

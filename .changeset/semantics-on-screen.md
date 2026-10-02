---
'gesso-framework': patch
---

Finding the accessibility boxes that moved after a layout now walks only what is on screen. It used to work out every mirrored node's box to learn whether it was visible, which cost a keystroke in a 5,000-line document 4 to 24 ms. Subtrees whose bounds are off screen are passed over whole.

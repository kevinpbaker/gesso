---
'gesso-core': patch
---

Recolouring a text's runs is a repaint. A change to `spans` that keeps every run's text and font and changes only its colour, background or decoration marks paint and nothing else; before, it measured the text again and rebuilt its semantics, which is what a code editor colouring a line a frame after drawing it paid on every line, on every keystroke.

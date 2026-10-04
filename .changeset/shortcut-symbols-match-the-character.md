---
'gesso-core': patch
---

A shortcut on punctuation, a digit or a symbol now matches the character the press produced, whatever it took to type it. `keys: '?'` used to match nothing, because every layout reaches `?` with Shift (Shift+/ in the US, Shift+ß in Germany, Shift+, in France), and `'Shift+?'` worked only where the layout used Shift rather than AltGr. Now `?` and `Shift+?` are the same shortcut, and a bare symbol also matches when AltGr (Control and Alt, or Option on a Mac) typed it. Letters keep their Shift, so `Shift+L` and `l` stay apart.

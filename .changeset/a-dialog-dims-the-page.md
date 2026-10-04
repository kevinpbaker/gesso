---
'gesso-core': minor
'gesso-framework': minor
'gesso-components': minor
---

A `Dialog` dims the page behind it, as a browser draws `<dialog>::backdrop`. Palettes have a new `scrim` token, a colour with alpha: the light page's ink at 40% in `lightColors`, black at 60% in `darkColors`, and left alone by high contrast. A custom palette written out in full needs one. Overlay entries take `scrim`, on by default for a `modal` entry and off for every other, so a menu or a list of suggestions never dims the page; the scrim takes its theme from the entry's `environment` and fades in at a dialog's pace, or appears at once under reduced motion. `Dialog` takes `scrim={false}` to leave the page undimmed; its backdrop still keeps the page from presses.

---
'gesso-core': patch
---

What a `textInput` surface draws is left out of the semantics tree: the editing proxy already carries its text as the field's value, so a screen reader heard it twice, and a keystroke in a code editor that redrew hundreds of runs rewrote as many elements of the accessibility mirror on the main thread.

---
'gesso-core': minor
'gesso-framework': minor
---

Scroll containers scroll from the keyboard. The arrow keys move the container around the focused node by 40 px, Page Up and Page Down and Space (Shift+Space back) by its height less an eighth, and Home and End to its ends; with nothing focused they move the largest container on screen, as a browser moves the document. A nested container at its end hands the key to the one around it. It is the last default a key gets, so a component that binds the same keys, a focused field moving its caret, and Space pressing a focused button are all unaffected, and a key held with Ctrl, Alt or Meta is left to the shortcut it is. Before this a keyboard-only reader could not get past the first screen of a pane that was not a list. `UiKeyboardScroller` is the default, passed as `scroll` to `UiKeyboardController`.

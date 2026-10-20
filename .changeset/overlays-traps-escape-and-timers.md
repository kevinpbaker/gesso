---
'gesso-components': patch
---

A `Dialog` closed by its owner while a menu or another dialog is open over it no longer takes the keyboard from that one. It used to release whichever focus trap was innermost, so a dialog closed by a timer or a finished save under an open `Menu` ended the menu's trap instead of its own, and focus left the window still on top. It now releases only its own, as `Menu` already did.

`Tooltip` and the `tooltip()` modifier close on Escape, wherever focus is and whether the pointer or the keyboard opened them, and stay closed until the pointer or focus arrives again (WCAG 1.4.13). With no tooltip open, Escape goes on to the page as before.

A `Toast` waits while the pointer is on it or focus is in it, and starts its time again from the whole `duration` when they leave. Tabbing to Undo as the four seconds ran out used to close the toast under the focus, and focus went with it. Writing `open` true again while a toast is up is not a change and does not restart the timer, which is now said in its docs, as is that `bottom-start` is the left corner in right-to-left text too.

`MenuBar` marks the title the arrows are on with the focus ring's colour while the bar has keyboard focus, so Left and Right visibly move along a closed bar. A command chosen with the pointer is followed by `onDismiss`, as one chosen with the keys always was and as the docs say.

A `Menu` whose items are all disabled opens with no row highlighted, rather than the first painted as if Enter would choose it.

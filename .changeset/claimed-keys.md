---
'gesso-core': minor
'gesso-framework': patch
'gesso-components': patch
---

The keys that scroll a page no longer scroll it under an application that uses them. In a worker, the shell could not wait to hear whether Down was used, so with a menu open in an embedded app, Down moved the highlight and scrolled the page as well. The runtime now says ahead of time which of the arrows, Page Up and Down, Home, End and Space it will use at its focus, and the shell cancels those and no others. A key is claimed when a key handler from the focused node up is marked with it, when a role on that path owns it (a menu, a list, a grid, a tree, a slider, a tab list, a toolbar and others), or when the keyboard's own scroller would move a pane with it, only the way the pane has room to go. A key nothing will use still scrolls the page.

`keymap` marks its handlers with their keys. `claimKeys(handler, keys)` marks one written by hand, `claimedKeysOf` reads a mark, `keysClaimedOnPath` works out the claims for a focus, `isScrollingKey` and `SCROLLING_KEYS` name the keys, and `UiKeyboardScroller.wouldScroll` says whether a key would move a pane without moving it. `GessoRuntime.onClaimedKeys` and `claimedKeys()` give the set, and the render worker posts it as a `claimedKeys` message.

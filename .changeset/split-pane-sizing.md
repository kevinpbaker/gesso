---
'gesso-components': patch
---

`SplitPane`'s divider no longer shrinks, and its second pane takes the space the first one leaves without being measured for it first. When a pane's content was wider than the track, the divider gave up most of its six pixels (it could be drawn 1 px wide), and it gave up a different amount for every content width. So every keystroke in a pane moved the pane by a fraction of a pixel and re-measured everything in it.

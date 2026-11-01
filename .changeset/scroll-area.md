---
'gesso-core': patch
'gesso-components': patch
---

`ScrollArea` is a scrolling region that says where it is: the bottom edge fades while there is more below, the top once it has moved off the start, and past `backToTopAfter` pixels a button eases in that scrolls it back smoothly, on the clock where it is drawn. The fades blend into `fadeColor` (`background` unless said), and `backToTop` takes the design's own drawing of the button. Its `padding` (and `paddingX`, `paddingY`) pads the content inside the scroll bar, so the area can run to the edges with its bar there. A gradient stop takes an `opacity`, applied once its palette name is resolved, so a fade to nothing stays its own colour rather than passing through grey on the way to transparent black.

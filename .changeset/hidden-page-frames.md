---
'gesso-core': patch
'gesso-framework': patch
---

A render worker draws the frames it asks for while its page is hidden or behind another window, paced by a timer, rather than waiting for a refresh that a hidden page never gets. A channel's patches are applied on a frame, so until now an answer the application thread sent while the page was hidden reached nothing: a request awaiting it never settled, and the screen and its semantics mirror kept what they last showed, until the page was shown again. The runtime still asks for no frame on a hidden page's account, so no caret blink or animation runs there.

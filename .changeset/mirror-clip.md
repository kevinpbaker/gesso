---
'gesso-framework': patch
---

The accessibility mirror can no longer be scrolled by the browser. A browser scrolls even an `overflow: hidden` box to bring something into view, as Tab focus, a screen reader or an automation tool does, and a region whose content reached past its box was left scrolled. Every element in it was then described tens of pixels from where it is drawn, so activating one by position activated its neighbour. The mirror now uses `overflow: clip`, which cannot be scrolled.

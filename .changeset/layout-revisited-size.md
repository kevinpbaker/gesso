---
'gesso-core': patch
---

A window resized to a size it had been at before now lays out at that size. Two things went wrong. A node sized in percent was handed back the size it had under a different container, because the container's size was not part of what layout remembered. And a stack whose measurement came from that memory placed its children at whatever size they had last been measured, which could be the other window's. An application shell with a percentage-width sidebar kept its sidebar at the old height, with the footer off screen or floating above the bottom, until something else changed.

---
'gesso-framework': patch
---

Every wheel step between two frames counts. Each was added to the offset the last layout settled on, so when a device sent faster than the display drew, as a trackpad does, each step overwrote the one before and a flick moved about half as far as it should, unevenly. A scroll now starts from where the container is going, clamped to its range.

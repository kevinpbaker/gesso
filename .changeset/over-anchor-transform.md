---
'gesso-core': patch
---

An anchored node placed `over` its anchor is grown by its offset in the anchor's own space before being carried through transforms: under a zoom the offset is zoomed with the anchor, and a part shrunk past nothing covers nothing rather than a box twice the offset across.

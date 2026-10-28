---
'gesso-core': patch
---

A key with a colon in it is one segment of its node's id. Ids join segments with colons, so a key like `a:0` could spell the id of the first child of a sibling keyed `a`, and reconciling threw "Node id … is already used outside parent". A list keyed by node ids, such as a layers panel's, hit it at once. The colon and `%` in a key are escaped; a key without them gives the id it always did.

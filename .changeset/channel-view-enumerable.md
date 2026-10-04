---
'gesso-framework': patch
---

A channel's `view` lists its declared keys: `Object.keys`, `in` and a spread now see them. With only a `get` trap, walking a view found nothing, and an app that snapshotted one by its keys got an empty object.

---
'gesso-framework': patch
---

An input cell handed the value it already holds no longer tells its subscribers, so a component's bindings do not run again for a value that did not change.

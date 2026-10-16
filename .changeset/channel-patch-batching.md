---
'gesso-framework': patch
---

Everything one turn of the application thread publishes to a channel now crosses as one message, and the replica tells each view key once per message. A command that moved five view keys used to post five messages and re-render between them.

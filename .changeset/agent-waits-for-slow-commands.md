---
'gesso-framework': patch
---

An agent that sends a command now gets the view after the command's effect, even when that effect takes longer than `quietMs` to arrive. Before, the call returned as soon as the view had been quiet for `quietMs` (50 ms by default), and a command that waits on a request (a fetch, a subprocess, a database) had usually changed nothing by then, so the agent was handed the view from before its own command and could conclude it had done nothing. Quiet now counts only once the view has changed since the command was sent. The cost is that a command which changes nothing in the view at all now returns at `settleMs` (1000 ms by default) rather than at `quietMs`.

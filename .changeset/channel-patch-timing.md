---
'gesso-framework': patch
---

A channel posts a change made outside a command as it is made again, as it did before 0.6.23, so a test that runs work synchronously and then reads the port finds the patches there. What a command publishes still crosses as one message, sent the moment the command returns rather than at the end of the turn.

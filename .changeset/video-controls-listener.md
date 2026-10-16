---
'gesso-components': patch
---

Video controls stop following a transport when it is replaced and when they unmount. They used to keep listening, piling up listeners and restarting the seek bar's readout for a clip nobody was showing.

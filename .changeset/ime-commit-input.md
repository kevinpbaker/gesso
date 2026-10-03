---
'gesso-core': patch
---

An IME commit that is what the composition already showed now fires `onInput`. The commit was compared with the text that already held the composition, so picking the candidate on screen (the usual case) changed nothing as far as the field could tell, and an application holding the text never heard of it.

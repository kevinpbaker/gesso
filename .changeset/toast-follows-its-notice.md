---
'gesso-components': patch
---

A `Toast` kept up while its `message` changes shows the new notice whole: its action button, tone and screen-reader label follow their inputs, and the new message gets the whole `duration` from when it arrives. The toast used to build its body from the values it opened with, so a second notice before the first had gone showed the new words with the old button, tone and label, and closed on the first notice's timer.

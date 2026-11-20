---
'gesso-framework': patch
---

The application worker sends what changed outside a command once per task instead of once per emission. A store that wrote three view keys in a row sent three messages, and a stream that emitted ten times before the task ended paid a structural diff and a structured clone for nine values the render worker never drew; each key's newest value is now compared and sent together, by a microtask, when the task is done. A command's patches still leave together the moment it returns, and anything else sent (an error, a full resend) still goes out after everything published before it. Code that publishes outside a command and reads the port straight away, a test above all, awaits a microtask first.

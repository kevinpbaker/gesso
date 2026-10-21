---
'gesso-core': patch
'gesso-framework': patch
---

A key release the application claims cancels the browser's default, as a key press already did. A lone Alt opens a Windows browser's menu when it is released, so a `MenuBar` that takes focus on Alt also had the browser's own menu open over it. On the main thread the platform adapter now passes a claimed release on to the browser event; in a render worker, `interceptKey` is asked about releases as well as presses.

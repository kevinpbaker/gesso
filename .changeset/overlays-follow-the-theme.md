---
'gesso-core': patch
'gesso-framework': patch
---

An open overlay now follows the theme of the place it was declared. The overlay layer read the theme, text style and content colour once, as the entry opened, so a dialog or menu open when the system turned dark, or when a theme the person chose arrived from another worker a moment after they opened it, stayed in the old theme over a page in the new one until it closed. Underneath, a modifier's `host.environment(key, of?)` and `host.onEnvironment(listener, of?)` can read and follow another node's environment, and an environment provided by a node whose own environment changed in the same frame is rebuilt in that frame.

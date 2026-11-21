---
'gesso-framework': patch
---

A file picker asked for right after a worker app loads now opens. The shell loads its file support after mount, and a request that came before the module did waited for it before it showed the picker; when the module took more than about five seconds, Chrome no longer counted the click and refused the picker with a `SecurityError`, which the application got as `denied`. The shell now shows the open, save and folder pickers (or the file input, in a browser without them) as the request arrives, and only reading, writing and remembering the file wait for the module. `reopenFile` and `saveFile` to a handle still wait for it, because the handle is in the module's store. The shell is 16.6 kB gzipped, from 16.0.

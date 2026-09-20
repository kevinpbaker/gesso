# gesso-vite-plugin

## 0.1.0

First public release.

`gesso()` finds an application's worker entries, writes the constructions and
the hot-replacement wiring, and mounts the development error overlay.

It is optional by design: nothing in `gesso-core` or `gesso-framework`
mentions Vite, and the literal `new Worker(new URL(...))` construction stays
the documented fallback. The plugin's factories go in first, so your own
options spread over them.

It also names the one failure that looks like a bug in the framework: a save
that reloads the page instead of replacing a module, because a module is
reached from the main thread as well as from the render worker.

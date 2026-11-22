---
'gesso-framework': patch
---

The single-thread app (`createSyncApp`, `GessoApp`) loads its file and sound support after mount, as the worker configuration already did, instead of with the app. A file request still opens its picker in the task it arrives in, before anything is awaited, so a slow load never costs the click that asked. `rememberedDirectory` and the handle stores now live in their own module, so exporting them from the package no longer keeps the rest of the file support in the first chunk. A page that used both configurations, as a playground or a docs site does, kept the file and sound modules in its first chunk, and the bundler warned that the worker's dynamic import did nothing. Now they are separate chunks, and the single-thread bundle is 2.5 kB smaller gzipped.

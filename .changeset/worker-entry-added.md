---
'gesso-vite-plugin': patch
---

A worker entry added beside the shell while the dev server runs, such as an `AppWorker.ts` written after the page first loaded, is now constructed on the next load. The dev server kept the shell it had transformed before the file existed, so every channel the new worker served failed with "registered with neither a worker nor a source" until a restart. Removing an entry is followed the same way.

---
'gesso-framework': patch
---

A worker whose script never loads is now reported with the reason to look for. A render worker refused by the browser (a 404, a MIME type, or the page's `Cross-Origin-Embedder-Policy`, including a copy cached before the policy was turned on) used to be reported as "the render worker failed to start: undefined"; it now says the script did not load, that the network panel has the reason, and what the usual reasons are. An app worker that never loaded used to say nothing at all and leave the screen waiting on its channels; it is now reported the same way.

---
'gesso-vite-plugin': minor
'gesso-framework': patch
---

A channel marked `@hidden` on its token is written as `internal` alone, with an empty view and no commands, instead of its whole JSON Schema. An agent is offered nothing of such a channel, so nothing read the schema, and every bundle that imports the token carried it. Its contract is still read, and anything in it that cannot cross a thread is still reported. In Calcwright, whose engine and autosave channels are internal, the render worker went from 3,411 kB to 2,469 kB (838 kB to 771 kB gzipped) and the application worker from 1,589 kB to 646 kB (283 kB to 218 kB gzipped).

---
'gesso-core': patch
'gesso-framework': patch
---

Under `vite dev`, an element written in JSX remembers the file, line and column it was written on, and a component remembers where it was used. The inspector's report says so: a node's `source` is the line that made it, and each owner's `usedAt` is the line that used the component around it, so `formatNodeReport` now reads `written at src/Settings.tsx:12:7` and `rendered by Card (used at src/Settings.tsx:30:9)`. `UiGraphBuilder.sourceOf(node)` gives the same answer for any node. A canvas has no DOM for the browser's own inspector to point at, and this is the way back from a box on screen to the code. A production build compiles to `jsx`, which is given no location, so it costs nothing there.

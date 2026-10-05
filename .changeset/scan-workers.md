---
'gesso-vite-plugin': patch
---

The first start of a dev server no longer fails its first page load. Vite's dependency scan never saw the workers the shell constructs or the overlay and agent bridge it loads lazily, so an app with Gesso installed from npm found those packages only when the page asked for them: Vite re-optimized, answered "504 (Outdated Optimize Dep)" for modules already served, and reloaded. The plugin now shows the scan the shell as the dev server serves it and imports each worker entry for it, so everything is pre-bundled up front.

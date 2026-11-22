---
'gesso-vite-plugin': minor
---

The component catalog an agent reads (`library_overview`, `library_search`, `library_get`) includes `gesso-components` by default whenever the project has it, so an agent told to use what the project has finds `Button` rather than being asked whether it meant `NavItem`. `catalog: { libraries: [] }` offers the project's own components alone. A named library installed from the registry is now read at all: the dev server resolved it to its pre-bundled copy in `node_modules/.vite/deps`, which has no declarations, and its declarations were read outside the project that imports them, so only a workspace link ever worked. `library_overview` names the library each count came from.

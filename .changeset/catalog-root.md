---
'gesso-vite-plugin': patch
---

`gesso({ catalog: { root } })` reads another project's components for the agent endpoint, rather than those of the project Vite serves: for an application that designs one, such as a design editor serving the project it works on from another folder. The dev server watches that folder too, so a component saved in a new file there is in the next answer.

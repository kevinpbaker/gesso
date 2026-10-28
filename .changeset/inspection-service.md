---
'gesso-framework': patch
---

`InspectionService` gives a component the inspector's answers about what is on the screen: `nodesAt(x, y)` is every node under a point, topmost first, in the coordinates a pointer event carries, and `inspect(node)` is the inspector's report on one, with the line that wrote it and where each component around it was used. It is for tools built in Gesso that point at Gesso, such as a design editor whose canvas holds live frames and where a click picks what is under it instead of pressing it. Injected like any service: `ctx.inject(InspectionService)`.

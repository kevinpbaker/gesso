---
'gesso-components': patch
---

`NavigationRail` can open a destination somewhere new. A Cmd-click (Ctrl-click off a Mac), a middle click, or Cmd-Enter or Ctrl-Enter on a focused row is reported to the new `onOpenElsewhere(key)` instead of `onChange`, and the active value does not move. A destination can also carry `to`, a router url or a `RouteTarget` as `Link` takes one: a plain press then navigates there after `onChange`, and a modified one asks the shell to open it somewhere new (`ShellService.openRoute`). It is opt-in: a rail with neither answers a modified press as a plain one, as before.

A `NavigationGroup` can be `disabled`: its heading and every row under it are announced as unavailable, drawn in the disabled ink, skipped by the arrows and type-ahead, and inert to the pointer, and the group no longer opens or closes from the rail.

An icon can be drawn as lines. `icon` now takes a `NavigationIcon`: a path string, filled exactly as before, or `{ path, style: 'stroke', strokeWidth }` for an outline icon set, where `path` may be several paths laid over each other and `fillRule` is passed through for a filled one.

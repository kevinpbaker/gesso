---
'gesso-components': patch
---

`PlainView` draws a screen described as plain data, for code that cannot run in the render worker: a plugin in a worker of its own, a server, another process. It sends a tree of `PlainNode`s (columns and rows, scrolling, text, headings, buttons, text fields, checkboxes, selects, lists and dividers), which cross a thread as any channel's data does, and hears back what the person did as `PlainAction`s. Sending the tree again changes it: nodes are matched by `key`, and one that stays keeps its controls, focus and scroll, with only its changed fields written. What arrives is checked by `plainNodeOf` (also exported) and held to limits on nodes, depth and string length; anything the view cannot draw is left out and reported through `onProblem` rather than thrown.

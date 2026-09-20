# gesso-devtools

## 0.2.1

### Patch Changes

- gesso-framework@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [be07839]
  - gesso-framework@0.2.0

## 0.1.0

First public release.

**The error overlay.** A canvas application that throws leaves its last good
frame on screen, looking exactly like one that works. `mountErrorOverlay(host)`
returns a `report` matching `WorkerAppOptions.onError`, so wiring it is one
line. It draws the message over the application, says which of five sources it
came from and what that costs the running app, quotes the original source line
with a caret under the column, and maps every stack frame back through the
source maps -- decoded in this package, with no dependency. A repeat counts
instead of stacking up, and a dismissal survives an error that throws every
frame.

**The panels**, each written against a port and hosted either by the Chrome
devtools extension or by a pane in the page: the node tree with owners, a
node's report (props with their sources, `listens`, `beneath`, and the layout
explanation), the frame profiler, the action log, and the render and
application workers' consoles with the thread named.

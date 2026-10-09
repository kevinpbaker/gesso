# gesso-devtools

## 0.6.14

### Patch Changes

- gesso-framework@0.6.14

## 0.6.13

### Patch Changes

- Updated dependencies [0020afa]
  - gesso-framework@0.6.13

## 0.6.12

### Patch Changes

- gesso-framework@0.6.12

## 0.6.11

### Patch Changes

- Updated dependencies
  - gesso-framework@0.6.11

## 0.6.10

### Patch Changes

- gesso-framework@0.6.10

## 0.6.9

### Patch Changes

- Updated dependencies [7af6f56]
  - gesso-framework@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [a7bb34e]
  - gesso-framework@0.6.8

## 0.6.7

### Patch Changes

- Updated dependencies [6493881]
- Updated dependencies [4f622ec]
  - gesso-framework@0.6.7

## 0.6.6

### Patch Changes

- gesso-framework@0.6.6

## 0.6.5

### Patch Changes

- Updated dependencies [e93e0ee]
  - gesso-framework@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [2f6a858]
  - gesso-framework@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies
  - gesso-framework@0.6.3

## 0.6.2

### Patch Changes

- gesso-framework@0.6.2

## 0.6.1

### Patch Changes

- gesso-framework@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [bf21b17]
- Updated dependencies [684b59a]
- Updated dependencies [e9f86a2]
- Updated dependencies [b0233fa]
- Updated dependencies [013e064]
- Updated dependencies [820aee8]
- Updated dependencies [cc9e62b]
  - gesso-framework@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [77195a4]
- Updated dependencies [6b71716]
- Updated dependencies [581cf89]
  - gesso-framework@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [5a27b40]
- Updated dependencies [f265910]
- Updated dependencies [d36a2fa]
- Updated dependencies [c38f97e]
- Updated dependencies [b90ecb2]
- Updated dependencies [96f4bdc]
- Updated dependencies [88d93b3]
- Updated dependencies [dc7f199]
- Updated dependencies [8fb3607]
- Updated dependencies [53b4c46]
- Updated dependencies [f0ade22]
- Updated dependencies [29a36ac]
- Updated dependencies [fac08c0]
- Updated dependencies [8c1b8ed]
- Updated dependencies [2bfedcd]
- Updated dependencies [979053a]
- Updated dependencies [1dfb6c2]
- Updated dependencies [99538fa]
- Updated dependencies [fb2a6d8]
- Updated dependencies [28f5b72]
- Updated dependencies [b7c9514]
- Updated dependencies [0bef08b]
- Updated dependencies [af33f45]
- Updated dependencies [93d580b]
- Updated dependencies [68b01e0]
- Updated dependencies [5d67836]
- Updated dependencies [acad77f]
- Updated dependencies [444371c]
- Updated dependencies [62883e0]
- Updated dependencies [f02740f]
- Updated dependencies [cf3b16a]
- Updated dependencies [5b59d13]
  - gesso-framework@0.5.0

## 0.4.2

### Patch Changes

- gesso-framework@0.4.2

## 0.4.1

### Patch Changes

- **`proofPanel`, the main-thread strip a worker app is judged by.** A pulse on the
  main thread's own animation frame, a button that blocks the thread and records
  when on the render worker's clock, and the render worker's rate, worst gap and
  median frame work — with `layout`, the layout heatmap and re-measure count too.
  The recording is published on a global for a budget script to read, including
  the last block's window. The arithmetic is `ProofRecording`, usable without a
  DOM.
- Updated dependencies
  - gesso-framework@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - gesso-framework@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [025321a]
- Updated dependencies [025321a]
  - gesso-framework@0.3.0

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

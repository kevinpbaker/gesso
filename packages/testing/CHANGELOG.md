# gesso-testing

## 0.6.16

### Patch Changes

- 4eed2fd: A node can take text without being a field: `textInput` makes it a surface that keeps and draws its own text, such as a code editor, and receives typed text through `onBeforeInput`, IME composition through the new `onCompositionStart`, `onCompositionUpdate` and `onCompositionEnd`, and the clipboard through `onPaste` and its state's `clipboard`. Keys belonging to an open IME composition (the Enter that commits a candidate, the arrows that choose one) are no longer forwarded as keys, which inserted a line on commit in a field too. A key whose `onKeyDown` called `preventDefault()` now keeps its text out, as in a browser; `UiKeyboardEvent.textFollows` says whether text follows a key at all. `fireEvent` gains `beforeInput`, the composition events, `copy` and `cut`.

  Key events carry `code`, the physical key (`KeyZ`), so a shortcut can match Option+Z on a Mac, where the key is `Ω`.

- Updated dependencies [d67e80b]
- Updated dependencies [dd5c789]
- Updated dependencies [b681046]
- Updated dependencies [1f60081]
- Updated dependencies [8149ae2]
- Updated dependencies [4eed2fd]
- Updated dependencies [548a3b0]
  - gesso-framework@0.6.16
  - gesso-core@0.6.16

## 0.6.15

### Patch Changes

- Updated dependencies [dd812b3]
- Updated dependencies [9872957]
  - gesso-framework@0.6.15
  - gesso-core@0.6.15

## 0.6.14

### Patch Changes

- gesso-core@0.6.14
  - gesso-framework@0.6.14

## 0.6.13

### Patch Changes

- Updated dependencies [0020afa]
  - gesso-framework@0.6.13
  - gesso-core@0.6.13

## 0.6.12

### Patch Changes

- gesso-core@0.6.12
  - gesso-framework@0.6.12

## 0.6.11

### Patch Changes

- Updated dependencies
- Updated dependencies
  - gesso-core@0.6.11
  - gesso-framework@0.6.11

## 0.6.10

### Patch Changes

- gesso-core@0.6.10
  - gesso-framework@0.6.10

## 0.6.9

### Patch Changes

- Updated dependencies [7af6f56]
  - gesso-framework@0.6.9
  - gesso-core@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [a7bb34e]
  - gesso-framework@0.6.8
  - gesso-core@0.6.8

## 0.6.7

### Patch Changes

- Updated dependencies [6493881]
- Updated dependencies [4f622ec]
  - gesso-framework@0.6.7
  - gesso-core@0.6.7

## 0.6.6

### Patch Changes

- gesso-core@0.6.6
  - gesso-framework@0.6.6

## 0.6.5

### Patch Changes

- Updated dependencies [e93e0ee]
  - gesso-framework@0.6.5
  - gesso-core@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [2f6a858]
  - gesso-framework@0.6.4
  - gesso-core@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies
  - gesso-core@0.6.3
  - gesso-framework@0.6.3

## 0.6.2

### Patch Changes

- gesso-core@0.6.2
  - gesso-framework@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [45f3ffe]
  - gesso-core@0.6.1
  - gesso-framework@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [bf21b17]
- Updated dependencies [684b59a]
- Updated dependencies [3b20918]
- Updated dependencies [e9f86a2]
- Updated dependencies [b0233fa]
- Updated dependencies [013e064]
- Updated dependencies [a81d551]
- Updated dependencies [820aee8]
- Updated dependencies [cc9e62b]
- Updated dependencies [684d68a]
  - gesso-core@0.6.0
  - gesso-framework@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [77195a4]
- Updated dependencies [6b71716]
- Updated dependencies [581cf89]
- Updated dependencies [13c096f]
- Updated dependencies [db7040b]
  - gesso-core@0.5.1
  - gesso-framework@0.5.1

## 0.5.0

### Minor Changes

- b43ada6: A frame that throws now fails the test: `renderTest`'s `frame()` and `settle()` throw the error from the frame that ran it, where before the frame was abandoned as it is in an application and the test went on against the last good picture. `allowFrameErrors: true` keeps the old behaviour for a test about that recovery.
- b7c9514: A paste carries the clipboard's HTML along with its text. The shell read only the plain text, so a copy from a web page or a document arrived without its headings, lists and links. `UiBeforeInputEvent`, `UiPasteEvent` and an editing group's edit now have `html` (null when the clipboard had none); the field still inserts the plain text, and an editor that keeps structure can cancel that and convert the HTML. `fireEvent.paste` takes the HTML as a second argument.

### Patch Changes

- Updated dependencies [5a27b40]
- Updated dependencies [f265910]
- Updated dependencies [d36a2fa]
- Updated dependencies [c38f97e]
- Updated dependencies [b90ecb2]
- Updated dependencies [8d25c04]
- Updated dependencies [20ac739]
- Updated dependencies [303e85a]
- Updated dependencies [96f4bdc]
- Updated dependencies [0f02fc2]
- Updated dependencies [88d93b3]
- Updated dependencies [dc7f199]
- Updated dependencies [8fb3607]
- Updated dependencies [4450c5c]
- Updated dependencies [53b4c46]
- Updated dependencies [d356006]
- Updated dependencies [101ea8a]
- Updated dependencies [839011e]
- Updated dependencies [f0ade22]
- Updated dependencies [29a36ac]
- Updated dependencies [7753bdc]
- Updated dependencies [47aba08]
- Updated dependencies [fac08c0]
- Updated dependencies [8c1b8ed]
- Updated dependencies [5b3508d]
- Updated dependencies [fe0c1e0]
- Updated dependencies [2ce079c]
- Updated dependencies [b502e0e]
- Updated dependencies [be3e274]
- Updated dependencies [2bfedcd]
- Updated dependencies [979053a]
- Updated dependencies [b2dddbc]
- Updated dependencies [ab0c1a6]
- Updated dependencies [80a3577]
- Updated dependencies [1dfb6c2]
- Updated dependencies [47aba08]
- Updated dependencies [99538fa]
- Updated dependencies [fb2a6d8]
- Updated dependencies [28f5b72]
- Updated dependencies [94a9f13]
- Updated dependencies [427ce99]
- Updated dependencies [b7c9514]
- Updated dependencies [d3ab865]
- Updated dependencies [0bef08b]
- Updated dependencies [aa33728]
- Updated dependencies [af33f45]
- Updated dependencies [6d51def]
- Updated dependencies [8c4f475]
- Updated dependencies [93d580b]
- Updated dependencies [1d61bae]
- Updated dependencies [68b01e0]
- Updated dependencies [5d67836]
- Updated dependencies [acad77f]
- Updated dependencies [444371c]
- Updated dependencies [62883e0]
- Updated dependencies [d617d34]
- Updated dependencies [6f03f61]
- Updated dependencies [2c572e3]
- Updated dependencies [84fe6d5]
- Updated dependencies [e73a5fc]
- Updated dependencies [1de054a]
- Updated dependencies [f02740f]
- Updated dependencies [9341d31]
- Updated dependencies [2e3e56d]
- Updated dependencies [cf3b16a]
- Updated dependencies [5b59d13]
- Updated dependencies [db1a6a1]
  - gesso-core@0.5.0
  - gesso-framework@0.5.0

## 0.4.2

### Patch Changes

- Updated dependencies [d27e076]
- Updated dependencies [d6c52da]
  - gesso-core@0.4.2
  - gesso-framework@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies
- Updated dependencies
  - gesso-core@0.4.1
  - gesso-framework@0.4.1

## 0.4.0

### Minor Changes

- **`DoubleClick`, dispatched after a second Click on the same node.** The pointer
  controller pairs Clicks on the same node within 500 ms and 4 px — the window the
  editing and selection controllers already use for a word — and dispatches
  `DoubleClick` after the second, as the DOM's `dblclick` follows its `click`. A
  press that became a drag or was cancelled spends the pair.

  `onDoubleClick` on any element; `fireEvent` gains `doubleClick` and
  `contextMenu`.

- **The coordinate path names the device, so a spec can press with a finger.**
  `fireEvent.pointerDown`, `pointerMove` and `pointerUp` take
  `pointer: 'mouse' | 'touch' | 'pen'`, passed to the controller as a
  `UiPointerDevice` with the ids a browser gives each. A mouse when absent, as
  everywhere.

  Every touch behaviour the engine has — a pan that scrolls, a long press that
  asks for a menu, the finger's slop — was reachable only from a shell until now.

### Patch Changes

- **`toHaveText('')` matches a field that is empty.** `textProperty` answers
  `undefined` for empty text, so that `getByText` does not find every empty node
  on the page — and `toHaveText` used it directly, so asserting that a field had
  been emptied failed with "it has none". That was true, and not the answer to the
  question asked of one node.

  The matcher now reads a node whose value or text is the empty string as showing
  `''`, and the queries keep their rule.

  Found by gessosheet, whose rules bar spec had to assert an emptied field
  indirectly.

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - gesso-core@0.4.0
  - gesso-framework@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [025321a]
- Updated dependencies [025321a]
- Updated dependencies [025321a]
  - gesso-framework@0.3.0
  - gesso-core@0.3.0

## 0.2.1

### Patch Changes

- gesso-core@0.2.1
  - gesso-framework@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
  - gesso-core@0.2.0
  - gesso-framework@0.2.0

## 0.1.0

First public release.

`renderTest(root)` builds, lays out and describes a tree on a manual clock,
then answers `getByRole`, `getByLabel` and `getByText` -- with `query`,
`getAll` and `find` variants -- from the very semantics tree the accessibility
mirror hands to the platform. There is no second definition of what a control
is for a test to drift away from.

It also carries `fireEvent` (pointer, wheel, keyboard, focus and typing, all
through the real controllers), `getLayout`, `explainText`, `settle` and a
`debug()` print of the tree.

The root entry imports no test runner, so it works under Vitest, under
`node:test`, or in a plain script. The matchers -- `toHaveBox`, `toHaveText`,
`toHaveSemantics`, `toHaveFocus` -- are behind `gesso-testing/matchers`,
because `expect.extend` is a side effect on a global. A `toHaveBox` that
misses prints the node's layout explanation beneath it.

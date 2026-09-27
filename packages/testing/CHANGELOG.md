# gesso-testing

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

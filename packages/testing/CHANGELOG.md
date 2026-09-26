# gesso-testing

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

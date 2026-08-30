---
'@gesso/testing': minor
'@gesso/framework': minor
---

`@gesso/testing`: mount a component with no browser and query it the way
an assistive technology would.

`renderTest(root)` builds, lays out and describes a tree on a manual
clock, then answers `getByRole`, `getByLabel` and `getByText` — with
`query`/`getAll`/`find` variants — from the very semantics tree the
accessibility mirror hands to the platform, so there is no second
definition of what a control is for a test to drift away from. It also
carries `fireEvent` (pointer, wheel, keyboard, focus, typing, all through
the real controllers), `getLayout`, `explainText`, `settle` and a
`debug()` print of the tree.

The root entry imports no test runner, so it works under vitest, under
`node:test`, or in a script. The vitest matchers — `toHaveBox`,
`toHaveText`, `toHaveSemantics`, `toHaveFocus` — are behind
`@gesso/testing/matchers`, because `expect.extend` is a side effect on a
global. A `toHaveBox` that misses prints the node's layout explanation
beneath it.

`GessoRuntimeOptions` gains `textMeasurer`, so layout and the renderers
can share a measurer that did not come from a canvas. A canvas double
answers `measureText` with the same width at every font size;
`renderTest` passes `CharacterCountTextMeasurer` instead.

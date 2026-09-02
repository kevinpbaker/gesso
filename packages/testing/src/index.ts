/**
 * `@gesso/testing` — mount a component without a browser.
 *
 * `ROADMAP.md` F7. Three things a component author needs and could not
 * have before this package existed:
 *
 *  - **A mount that is not a copy of a mount.** Every spec that drove a
 *    real runtime carried its own canvas double and its own `mount`
 *    helper with its own `click`, `press` and `byRole`; five of them in
 *    `@gesso/components` alone, and they had already drifted (one
 *    `byRole` returned a node, another returned an array).
 *  - **Queries that are the semantics tree.** `getByRole` reads what
 *    `SemanticsMirror` writes into the off-screen DOM, so a component
 *    that is hard to find in a test is exactly a component that is hard
 *    to find with a screen reader. There is no second definition of
 *    what a control *is* for tests to drift away from.
 *  - **An answer to "why is this box wrong".** `explainText` and the
 *    `toHaveBox` matcher print L8's layout explanation next to the
 *    number that surprised you.
 *
 * Nothing in this entry imports a test runner, so it works under
 * vitest, under `node:test`, or in a plain script. The matchers do
 * (`expect.extend` is a side effect on a global) and live behind
 * `@gesso/testing/matchers`.
 */
export { renderTest } from './renderTest';
export type { Rendered, RenderedBase, RenderTestOptions } from './renderTest';
export { createFireEvent } from './fireEvent';
export type { FireEvent, PointAt } from './fireEvent';
export { nodesUnder, textProperty } from './queries';
export type { Queries, RoleQueryOptions, TextMatch } from './queries';
export { formatTree } from './debug';
export { renderedFor } from './registry';
export { serveForTest, type ServedForTest } from './channels';

import type { UiNode } from 'gesso-core';

import type { Rendered } from './renderTest';

/**
 * Which render a node came from.
 *
 * The matchers need it and cannot be handed it: `expect(node).toHaveBox(…)`
 * gives them a node and nothing else, and a node has no idea which
 * runtime laid it out — the graph is deliberately free of back
 * references to anything above it. So `renderTest` registers its layout
 * root here and `renderedFor` walks up from any node to find it.
 *
 * A `WeakMap` keyed by the root, rather than a module-level "current
 * render": two trees can be mounted at once (a spec comparing them,
 * or a suite running in parallel), and a global would make the second
 * one silently answer for the first.
 */
const RENDERS = new WeakMap<UiNode, Rendered>();

export function registerRendered(root: UiNode, rendered: Rendered): void {
  RENDERS.set(root, rendered);
}

/** The render `node` belongs to, or null if it was not mounted by one. */
export function renderedFor(node: UiNode): Rendered | null {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    const rendered = RENDERS.get(current);
    if (rendered !== undefined) {
      return rendered;
    }
  }
  return null;
}

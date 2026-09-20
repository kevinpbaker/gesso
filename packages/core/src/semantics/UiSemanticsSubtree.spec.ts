import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { buildSemanticsSubtree, buildSemanticsTree, semanticsInertAbove } from './UiSemanticsTree';

/**
 * A subtree walk has to give the answer the whole walk gives.
 *
 * `buildSemanticsSubtree` exists so that changing one label does not
 * cost a walk of every node, and the only thing that makes it safe is
 * that its records are indistinguishable from the ones a full build
 * would have produced for the same nodes. These specs compare them
 * directly, including the two places the numbering could drift: a
 * node with semantic siblings before it, and a transparent node whose
 * children are numbered among someone else's.
 */
describe('a semantics subtree', () => {
  function tree() {
    const graph = new UiGraph();
    const root = graph.createNode('main', UiNodeType.Column);
    root.setProperty('role', 'main');
    // Labelled, so the landmark does not claim its contents as its own
    // name and swallow the rows this spec is about.
    root.setProperty('label', 'Everything');
    const nodes: Record<string, UiNode> = { main: root };
    for (let i = 0; i < 3; i++) {
      const row = graph.createNode(`row-${i}`, UiNodeType.Row);
      graph.appendChild(root, row);
      nodes[`row-${i}`] = row;
      // A transparent wrapper, so the button's text is claimed through
      // one and the loose text is not.
      const wrap = graph.createNode(`wrap-${i}`, UiNodeType.Box);
      graph.appendChild(row, wrap);
      nodes[`wrap-${i}`] = wrap;
      const button = graph.createNode(`button-${i}`, UiNodeType.Button);
      graph.appendChild(wrap, button);
      nodes[`button-${i}`] = button;
      const label = graph.createNode(`label-${i}`, UiNodeType.Text);
      label.setProperty('text', `Press ${i}`);
      graph.appendChild(button, label);
      nodes[`label-${i}`] = label;
      const prose = graph.createNode(`prose-${i}`, UiNodeType.Text);
      prose.setProperty('text', `Row ${i} says something`);
      graph.appendChild(row, prose);
      nodes[`prose-${i}`] = prose;
    }
    return { graph, root, nodes };
  }

  /** The records a full build gives for `node` and everything under it. */
  function sliceOf(root: UiNode, node: UiNode) {
    const full = buildSemanticsTree(root);
    const ids = new Set<string>();
    const stack: UiNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      ids.add(current.id);
      for (let child = current.firstChild; child !== null; child = child.nextSibling) {
        stack.push(child);
      }
    }
    return new Map([...full].filter(([id]) => ids.has(id)));
  }

  it('gives a record holder the records a full walk gives it', () => {
    const { root, nodes } = tree();
    for (const id of ['button-0', 'button-2', 'prose-1', 'main']) {
      const node = nodes[id]!;
      const full = buildSemanticsTree(root);
      const own = full.get(id)!;
      const subtree = buildSemanticsSubtree(node, own.parent, own.index, semanticsInertAbove(node));
      expect(subtree, `subtree of ${id}`).not.toBeNull();
      expect([...subtree!].sort()).toEqual([...sliceOf(root, node)].sort());
    }
  });

  it('keeps the index a later sibling has, rather than numbering from zero', () => {
    const { root, nodes } = tree();
    const full = buildSemanticsTree(root);
    const third = full.get('prose-2')!;
    expect(third.index).toBeGreaterThan(0);
    const subtree = buildSemanticsSubtree(nodes['prose-2']!, third.parent, third.index, false)!;
    expect(subtree.get('prose-2')!.index).toBe(third.index);
  });

  it('refuses a transparent node, whose children are numbered elsewhere', () => {
    const { nodes } = tree();
    // A plain Box with no role, no label and no text of its own: its
    // descendants attach to the row above it, alongside the row's other
    // children, so nothing here can number them.
    expect(buildSemanticsSubtree(nodes['wrap-0']!, null, 0, false)).toBeNull();
  });

  it('carries an ancestor s disabled into the subtree it walks', () => {
    const { root, nodes } = tree();
    nodes['row-1']!.setProperty('disabled', true);
    const full = buildSemanticsTree(root);
    expect(full.get('button-1')!.disabled).toBe(true);

    const own = full.get('button-1')!;
    const inert = semanticsInertAbove(nodes['button-1']!);
    expect(inert).toBe(true);
    const subtree = buildSemanticsSubtree(nodes['button-1']!, own.parent, own.index, inert)!;
    expect(subtree.get('button-1')!.disabled).toBe(true);
  });
});

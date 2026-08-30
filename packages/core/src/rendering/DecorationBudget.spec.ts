import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { Constraints } from '../layout/LayoutTypes';
import { RenderHarness } from './RenderTestUtils';
import { buildRenderList } from './webgpu/WebGPURenderData';
import type { DecorationShape } from './Decorations';

/**
 * What the decoration branch costs (MODIFIERS_ROADMAP.md §6's risk).
 *
 * The L7 budget tree: 10,502 nodes, a 1200x800 viewport showing about
 * twenty rows. Every node in both backends now reads
 * `node.decorations` and compares it with null, and the roadmap asks
 * what that costs before it is accepted.
 */
describe('decoration cost on the L7 budget tree', () => {
  const ROWS = 500;
  const VIEWPORT = Constraints.loose(1200, 800);
  const VISIBLE_ROWS = Math.ceil(800 / 40) + 1;
  const RING: readonly DecorationShape[] = [{ kind: 'stroke', color: '#f00', lineWidth: 2, outset: 3 }];

  function node(h: RenderHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  function buildTree(h: RenderHarness, decorate: 'none' | 'rows') {
    const root = node(h, 'top', UiNodeType.Column);
    const list = node(h, 'list', UiNodeType.ScrollView, { flex: 1 });
    for (let r = 0; r < ROWS; r++) {
      const row = node(h, `row${r}`, UiNodeType.Row, {
        height: 40,
        gap: 8,
        padding: 4,
        backgroundColor: r % 2 ? '#fff' : '#f4f4f4',
        flexShrink: 0
      });
      if (decorate === 'rows') {
        row.decorations = RING;
      }
      for (let c = 0; c < 5; c++) {
        const column = node(h, `row${r}c${c}`, UiNodeType.Column, { flex: 1, minWidth: 0 });
        for (let t = 0; t < 3; t++) {
          h.append(
            column,
            node(h, `row${r}c${c}t${t}`, UiNodeType.Text, { text: `Row ${r} column ${c} line ${t}`, fontSize: 10 })
          );
        }
        h.append(row, column);
      }
      h.append(list, row);
    }
    h.append(root, list);
    return { root, list };
  }

  function median(samples: number[]): number {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function measure(decorate: 'none' | 'rows'): { ms: number; instances: number } {
    const h = new RenderHarness(1200, 800);
    const { root, list } = buildTree(h, decorate);
    list.setProperty('scrollY', 4000);
    h.layout(root, VIEWPORT);
    let instances = 0;
    const samples: number[] = [];
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      const result = buildRenderList(root, h.engine, h.measurer, 1200, 800, 1, 0);
      samples.push(performance.now() - start);
      instances = result.instanceCount;
    }
    return { ms: median(samples), instances };
  }

  it('costs a null check on an undecorated tree, and one instance per decorated node on screen', () => {
    const plain = measure('none');
    const decorated = measure('rows');
    // eslint-disable-next-line no-console
    console.info(
      `[decoration budget] undecorated ${plain.ms.toFixed(3)} ms (${plain.instances} instances) · ` +
        `every row decorated ${decorated.ms.toFixed(3)} ms (${decorated.instances} instances)`
    );

    // Every one of the 500 rows carries a ring, and only the ones in
    // the visible window emit an instance — decorations follow the
    // window exactly as the rows' own fills do, and a decorated tree
    // costs nothing for the part of itself that is not on screen.
    const added = decorated.instances - plain.instances;
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThanOrEqual(VISIBLE_ROWS);
    // An order of magnitude above the measured value, as the other
    // budget spec caps its timings.
    expect(decorated.ms).toBeLessThan(40);
  });
});

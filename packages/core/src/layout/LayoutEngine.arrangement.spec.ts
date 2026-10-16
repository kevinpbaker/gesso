import { afterEach, describe, expect, it, vi } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { auto, fr, percent } from './UiLength';

/**
 * A flex or grid container measured in the box it is then placed in
 * hands its placement the arrangement it worked out, rather than having
 * placement collect, flex and size everything a second time; see
 * `LayoutRecord.arrangement`. These check that the second time is gone
 * when the box is the same, that it comes back when it is not, and
 * that either way every box comes out where the long way puts it.
 */
describe('LayoutEngine arrangement reuse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  const text = (h: LayoutHarness, id: string, value: string, props: Record<string, unknown> = {}) =>
    node(h, id, UiNodeType.Text, { text: value, fontSize: 10, lineHeight: 12, ...props });

  /**
   * One of most things placement does with lines it is handed: a row
   * that flexes wrapping text, auto margins, a wrapping row, baseline
   * alignment, percentages, and a grid with a fractional track.
   */
  function page(h: LayoutHarness): UiNode[] {
    const root = node(h, 'top', UiNodeType.Column, { padding: 6, gap: 4 });
    const flexed = node(h, 'flexed', UiNodeType.Row, { gap: 8, padding: 3 });
    h.append(
      flexed,
      text(h, 'flexed-a', 'A sentence long enough to wrap when the row is narrow', { flex: 1 }),
      node(h, 'flexed-b', UiNodeType.Box, { width: 40, height: 20, marginLeft: auto }),
      node(h, 'flexed-c', UiNodeType.Box, { width: percent(10), height: 10 })
    );
    const margins = node(h, 'margins', UiNodeType.Row, { padding: 2 });
    h.append(
      margins,
      node(h, 'margins-a', UiNodeType.Box, { width: 30, height: 10 }),
      node(h, 'margins-b', UiNodeType.Box, { width: 30, height: 10, marginLeft: auto, marginRight: auto }),
      node(h, 'margins-c', UiNodeType.Box, { width: 30, height: 10, marginTop: auto })
    );
    const wrapping = node(h, 'wrapping', UiNodeType.Row, { flexWrap: 'wrap', gap: 5, alignContent: 'center' });
    for (let i = 0; i < 7; i++) {
      h.append(wrapping, node(h, `wrapping-${i}`, UiNodeType.Box, { width: 70, height: 10 + i }));
    }
    const baseline = node(h, 'baseline', UiNodeType.Row, { y: 'baseline', x: 'spaceBetween' });
    h.append(
      baseline,
      text(h, 'baseline-a', 'Big', { fontSize: 20, lineHeight: 24 }),
      text(h, 'baseline-b', 'small'),
      node(h, 'baseline-c', UiNodeType.Box, { width: 12, height: 30, y: 'center' })
    );
    const grid = node(h, 'grid', UiNodeType.Grid, { columns: [100, fr(1), fr(2)], gap: 4, flex: 1 });
    for (let i = 0; i < 6; i++) {
      h.append(grid, text(h, `grid-${i}`, `Cell ${i} with words in it`));
    }
    h.append(root, flexed, margins, wrapping, baseline, grid);
    const nodes: UiNode[] = [];
    const walk = (n: UiNode) => {
      nodes.push(n);
      for (let child = n.firstChild; child !== null; child = child.nextSibling) {
        walk(child);
      }
    };
    walk(root);
    return nodes;
  }

  type Spied = {
    collectFlexItems(...args: unknown[]): unknown;
    layoutGrid(...args: unknown[]): unknown;
    takeArrangement(...args: unknown[]): unknown;
  };

  /**
   * Lays `root` out and counts, per container, how many times its items
   * were collected (flex) or its tracks sized (grid). `longWay` never
   * hands placement an arrangement, which is the engine as it was.
   */
  function arranging(h: LayoutHarness, root: UiNode, constraints: Constraints, longWay = false) {
    const engine = h.engine as unknown as Spied;
    if (longWay) {
      vi.spyOn(engine, 'takeArrangement').mockReturnValue(null);
    }
    const collect = vi.spyOn(engine, 'collectFlexItems');
    const grid = vi.spyOn(engine, 'layoutGrid');
    h.layout(root, constraints);
    const counts: Record<string, number> = {};
    for (const [container] of [...collect.mock.calls, ...grid.mock.calls]) {
      const id = (container as UiNode).id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    collect.mockRestore();
    grid.mockRestore();
    return counts;
  }

  const measurer = () => new CharacterCountTextMeasurer({ glyphWidth: 0.6 });

  it('places a container measured in its final box without collecting its items again', () => {
    const viewport = Constraints.loose(320, 600);
    const fresh = new LayoutHarness(measurer());
    const longWay = arranging(fresh, page(fresh)[0]!, viewport, true);
    const h = new LayoutHarness(measurer());
    const reused = arranging(h, page(h)[0]!, viewport);

    // The root fills the viewport and stretches each row and the grid,
    // so each is measured last in the box it is placed in. Measurement
    // may still run more than once (a row is asked loose, then at its
    // flexed size), but placement, which was one more apiece, is none.
    const ids = ['top', 'flexed', 'margins', 'wrapping', 'baseline', 'grid'];
    expect(Object.keys(longWay).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(reused[id], id).toBe(longWay[id]! - 1);
    }
  });

  it('works the arrangement out again when the box placed in is not the one measured', () => {
    const build = (h: LayoutHarness) => {
      // Start-aligned, the row is measured loose across and placed at
      // the width it asked for: a different box, so placement starts
      // afresh. The column around it still fills the viewport.
      const top = node(h, 'top', UiNodeType.Column, { x: 'start' });
      const row = node(h, 'row', UiNodeType.Row, { gap: 4 });
      h.append(row, text(h, 'a', 'One'), text(h, 'b', 'Two'));
      h.append(top, row);
      return { top, row };
    };
    const viewport = Constraints.loose(300, 200);
    const fresh = new LayoutHarness(measurer());
    const longWay = arranging(fresh, build(fresh).top, viewport, true);
    const h = new LayoutHarness(measurer());
    const { top, row } = build(h);
    const reused = arranging(h, top, viewport);

    expect(reused['row']).toBe(longWay['row']);
    expect(reused['top']).toBe(longWay['top']! - 1);
    expect(h.box(row)).toEqual({ x: 0, y: 0, width: 4 + 2 * 18, height: 12 });
  });

  it.each([320, 211, 900])('puts every box where the long way puts it, %dpx wide', width => {
    const reused = new LayoutHarness(measurer());
    const fresh = new LayoutHarness(measurer());
    const reusedNodes = page(reused);
    const freshNodes = page(fresh);
    // The long way: placement is never handed an arrangement.
    vi.spyOn(fresh.engine as unknown as Spied, 'takeArrangement').mockReturnValue(null);
    for (const height of [600, 90]) {
      reused.layout(reusedNodes[0]!, Constraints.loose(width, height));
      fresh.layout(freshNodes[0]!, Constraints.loose(width, height));
      for (let i = 0; i < reusedNodes.length; i++) {
        const a = reused.record(reusedNodes[i]!);
        const b = fresh.record(freshNodes[i]!);
        expect(reused.box(reusedNodes[i]!), reusedNodes[i]!.id).toEqual(fresh.box(freshNodes[i]!));
        expect(
          [a.measuredWidth, a.measuredHeight, a.baseline, a.relayoutBoundary, a.contentMatters],
          reusedNodes[i]!.id
        ).toEqual([b.measuredWidth, b.measuredHeight, b.baseline, b.relayoutBoundary, b.contentMatters]);
      }
    }
  });
});

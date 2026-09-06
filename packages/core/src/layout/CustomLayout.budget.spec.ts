import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { UiFrame } from '../scheduler/UiFrame';
import { MAX_MEASURES_PER_CHILD } from './CustomLayout';
import type { UiLayoutProtocol } from './CustomLayout';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import type { Size } from './LayoutTypes';

/**
 * Budgets for the two things X7 added to the pass, in the shape
 * `LayoutEngine.budget.spec.ts` set: counts, not wall time.
 *
 * Both are budgets rather than behaviour tests because both are the
 * "sugar that hides cost" risk in `EXCELLENCE_ROADMAP.md` §5. A custom
 * layout is application code inside the measure phase, and a container
 * query is a layout that can ask for another layout, which is the one
 * thing in this workstream that could cost a second pass over a
 * subtree nothing changed in.
 */
describe('custom layout budgets', () => {
  const TILES = 400;
  const VIEWPORT = Constraints.loose(1200, 800);

  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  /** Every child measured once at the column width, then placed. */
  const masonry: UiLayoutProtocol = {
    name: 'masonry',
    layout(children, constraints): Size {
      const columns = 4;
      const gap = 8;
      const available = isFinite(constraints.maxWidth) ? constraints.maxWidth : 0;
      const width = Math.max(0, (available - gap * (columns - 1)) / columns);
      const heights = Array.from({ length: columns }, () => 0);
      for (const child of children) {
        let shortest = 0;
        for (let column = 1; column < columns; column++) {
          if (heights[column] < heights[shortest]) {
            shortest = column;
          }
        }
        const size = child.measure(new Constraints(width, width, 0, Infinity));
        child.place(shortest * (width + gap), heights[shortest]);
        heights[shortest] += size.height + gap;
      }
      return { width: available, height: Math.max(0, ...heights) };
    }
  };

  function buildWall(h: LayoutHarness) {
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, { width: 1200, layout: masonry });
    const tiles: UiNode[] = [];
    for (let index = 0; index < TILES; index++) {
      const tile = node(h, `tile${index}`, UiNodeType.Box, { height: 60 + (index % 7) * 10 });
      tiles.push(tile);
      h.append(wall, tile);
    }
    h.append(root, wall);
    return { root, wall, tiles };
  }

  function frame(h: LayoutHarness, dirty: [UiNode, DirtyFlags][]): void {
    h.engine.layoutForFrame(new UiFrame(1, 0, new Map(dirty)), VIEWPORT);
  }

  it('measures each child twice for a full pass and no more, however many there are', () => {
    const h = new LayoutHarness();
    const { root } = buildWall(h);
    h.layout(root, VIEWPORT);
    const { measured } = h.engine.stats;
    // eslint-disable-next-line no-console
    console.info(`[custom layout budget] full pass over ${TILES} tiles: measured ${measured}`);
    // The wall itself, and every tile once in the measure run and once
    // in the place run. Linear in the children, which is the property
    // that matters: a protocol that measured inside a loop over its
    // siblings would put a factor of `TILES` on this and is refused by
    // `MAX_MEASURES_PER_CHILD` before it can.
    expect(measured).toBeLessThanOrEqual(1 + TILES * MAX_MEASURES_PER_CHILD);
    expect(measured).toBeGreaterThanOrEqual(TILES);
  });

  it('re-measures only the changed tile and the wall when one tile grows', () => {
    const h = new LayoutHarness();
    const { root, tiles } = buildWall(h);
    h.layout(root, VIEWPORT);
    const target = tiles[TILES / 2];
    target.setProperty('height', 400);
    h.engine.trace = true;
    frame(h, [[target, DirtyFlags.Layout]]);
    const { measured, fullLayout } = h.engine.stats;
    // eslint-disable-next-line no-console
    console.info(`[custom layout budget] one tile grew: measured ${measured}, full ${fullLayout}`);
    // The wall has to run its protocol again — the arrangement of every
    // tile depends on every other tile's height, which is what a
    // masonry is — but a memo hit answers for every tile whose
    // constraints did not change, so only the changed one is measured
    // again. The two runs make that two.
    expect(measured).toBeLessThanOrEqual(4);
  });

  it('costs nothing when a frame changes nothing', () => {
    const h = new LayoutHarness();
    const { root, wall } = buildWall(h);
    h.layout(root, VIEWPORT);
    frame(h, [[wall, DirtyFlags.Transform]]);
    expect(h.engine.stats.measured).toBe(0);
    expect(h.engine.stats.placed).toBe(0);
  });
});

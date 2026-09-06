import { describe, expect, it } from 'vitest';

import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { MAX_MEASURES_PER_CHILD } from './CustomLayout';
import type { UiLayoutChild, UiLayoutProtocol } from './CustomLayout';
import { formatExplanation } from './LayoutExplanation';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import type { Size } from './LayoutTypes';

/**
 * The custom layout protocol (roadmap X7): a node whose author
 * measures and places its own children, in the engine's own
 * constraints vocabulary.
 *
 * Two halves. The first is that a protocol works: a masonry written
 * here against the public interface alone produces the boxes a masonry
 * should, mirrors under rtl, and says something useful in `explain`.
 * The second is the fence, which matters more, because a protocol is
 * application code running inside the layout pass: the cases at the
 * bottom are the ones that must throw rather than quietly corrupt a
 * pass or make it quadratic.
 */
describe('custom layout', () => {
  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  /**
   * The layout the playground demo is built from, in miniature: a
   * fixed number of equal columns, each child measured once at the
   * column width and dropped into whichever column is shortest.
   */
  function masonry(columns: number, gap: number): UiLayoutProtocol {
    const heightsOf = (children: readonly UiLayoutChild[], width: number): number[] => {
      const heights = Array.from({ length: columns }, () => 0);
      for (const child of children) {
        let shortest = 0;
        for (let column = 1; column < columns; column++) {
          if (heights[column] < heights[shortest]) {
            shortest = column;
          }
        }
        const top = heights[shortest];
        const size = child.size.height > 0 ? child.size : child.measure(new Constraints(width, width, 0, Infinity));
        child.place(shortest * (width + gap), top === 0 ? 0 : top + gap);
        heights[shortest] = (top === 0 ? 0 : top + gap) + size.height;
      }
      return heights;
    };
    return {
      name: 'masonry',
      layout(children, constraints) {
        const available = isFinite(constraints.maxWidth) ? constraints.maxWidth : 0;
        const width = Math.max(0, (available - gap * (columns - 1)) / columns);
        const heights = heightsOf(children, width);
        return { width: available, height: Math.max(0, ...heights) };
      },
      explain(children, size) {
        return [
          `${columns} columns of ${(size.width - gap * (columns - 1)) / columns} px, ${gap} px apart`,
          `${children.length} items, tallest column ${size.height} px`
        ];
      }
    };
  }

  /** A protocol whose only job is to record what it was handed. */
  function recording(record: (children: readonly UiLayoutChild[], constraints: Constraints) => void): UiLayoutProtocol {
    return {
      name: 'recorder',
      layout(children, constraints) {
        record(children, constraints);
        return { width: 0, height: 0 };
      }
    };
  }

  function tiles(h: LayoutHarness, parent: UiNode, heights: readonly number[]): UiNode[] {
    return heights.map((height, index) => {
      const tile = node(h, `tile${index}`, UiNodeType.Box, { height });
      h.append(parent, tile);
      return tile;
    });
  }

  it('places children where the protocol put them', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, { width: 320, layout: masonry(3, 10) });
    const items = tiles(h, wall, [40, 60, 20, 30]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    // 320 less two 10px gaps over three columns is 100 each.
    expect(h.box(items[0])).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(h.box(items[1])).toEqual({ x: 110, y: 0, width: 100, height: 60 });
    expect(h.box(items[2])).toEqual({ x: 220, y: 0, width: 100, height: 20 });
    // The fourth goes under the shortest column, which is the third.
    expect(h.box(items[3])).toEqual({ x: 220, y: 30, width: 100, height: 30 });
    // The container is as tall as its tallest column.
    expect(h.box(wall).height).toBe(60);
  });

  it('lets the container size itself from what the protocol returned', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, { width: 210, padding: 5, layout: masonry(2, 10) });
    tiles(h, wall, [40, 90]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    // Padding is the engine's, not the protocol's: the protocol saw a
    // 200 wide content box and the container is 10 taller than it said.
    expect(h.box(wall)).toEqual({ x: 0, y: 0, width: 210, height: 100 });
  });

  it('mirrors the arrangement under rtl without the protocol knowing', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 320,
      textDirection: 'rtl',
      layout: masonry(3, 10)
    });
    const items = tiles(h, wall, [40, 60, 20]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    // The first column is now the right-hand one.
    expect(h.box(items[0]).x).toBe(220);
    expect(h.box(items[1]).x).toBe(110);
    expect(h.box(items[2]).x).toBe(0);
  });

  it('tells the protocol which way it is being mirrored', () => {
    const h = new LayoutHarness();
    let direction: string | undefined;
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 100,
      textDirection: 'rtl',
      layout: {
        name: 'probe',
        layout(_children, _constraints, context): Size {
          direction = context.direction;
          return { width: 0, height: 0 };
        }
      } satisfies UiLayoutProtocol
    });
    tiles(h, wall, [10]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    expect(direction).toBe('rtl');
  });

  it('carries layoutData through to the protocol', () => {
    const h = new LayoutHarness();
    let seen: unknown[] = [];
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 100,
      layout: recording(children => {
        seen = children.map(child => child.data);
      })
    });
    const first = node(h, 'a', UiNodeType.Box, { height: 10, layoutData: { lane: 2 } });
    const second = node(h, 'b', UiNodeType.Box, { height: 10 });
    h.append(wall, first, second);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    expect(seen).toEqual([{ lane: 2 }, undefined]);
  });

  it('measures and places a child the protocol ignored', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 200,
      height: 100,
      layout: recording(() => {})
    });
    const ignored = node(h, 'ignored', UiNodeType.Box, { width: 30, height: 20 });
    h.append(wall, ignored);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    // A box, not a stale one from a previous frame and not a zero.
    expect(h.box(ignored)).toEqual({ x: 0, y: 0, width: 30, height: 20 });
  });

  it('hands the protocol the content box at placement, padding removed', () => {
    const h = new LayoutHarness();
    const widths: number[] = [];
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 200,
      height: 80,
      paddingX: 15,
      paddingY: 5,
      layout: recording((_children, constraints) => widths.push(constraints.maxWidth))
    });
    tiles(h, wall, [10]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    // Once measuring, once placing, and 170 both times.
    expect(widths).toEqual([170, 170]);
  });

  it('explains itself, and says why a child is where it is', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, { width: 320, layout: masonry(3, 10) });
    const items = tiles(h, wall, [40, 60, 20]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    const wallText = formatExplanation(h.engine.explain(wall));
    expect(wallText).toContain("layout 'masonry' over 3 children");
    expect(wallText).toContain('3 columns of 100 px, 10 px apart');
    expect(wallText).toContain('tallest column 60 px');

    const child = h.engine.explain(items[1]);
    expect(child.width.decidedBy).toBe('custom');
    expect(formatExplanation(child)).toContain("the 'masonry' layout on box 'wall' measured it at 100");
  });

  it('says so when a protocol does not explain itself', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, { width: 100, layout: recording(() => {}) });
    tiles(h, wall, [10]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    expect(formatExplanation(h.engine.explain(wall))).toContain("'recorder' does not explain itself");
  });

  // ---------------------------------------------------------------------------
  // The fence
  // ---------------------------------------------------------------------------

  it('refuses a third measurement of the same child, so a pass cannot go quadratic', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 100,
      layout: {
        name: 'greedy',
        layout(children): Size {
          // The shape that turns a pass quadratic: every child
          // re-measured inside a loop over every other child.
          for (const outer of children) {
            for (const inner of children) {
              void outer;
              inner.measure(Constraints.loose(100, 100));
            }
          }
          return { width: 0, height: 0 };
        }
      } satisfies UiLayoutProtocol
    });
    tiles(h, wall, [10, 10, 10]);
    h.append(root, wall);

    expect(() => h.layout(root, Constraints.loose(400, 400))).toThrow(
      `The 'greedy' layout measured child 0 more than ${MAX_MEASURES_PER_CHILD} times`
    );
  });

  it('allows the two measurements the engine takes for its own flex items', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 100,
      layout: {
        name: 'twice',
        layout(children): Size {
          for (const child of children) {
            child.measure(Constraints.loose(100, 100));
            child.measure(Constraints.tight(50, 20));
            child.place(0, 0);
          }
          return { width: 50, height: 20 };
        }
      } satisfies UiLayoutProtocol
    });
    const only = node(h, 'only', UiNodeType.Box, {});
    h.append(wall, only);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    expect(h.box(only)).toEqual({ x: 0, y: 0, width: 50, height: 20 });
  });

  it('refuses a handle kept past the call that was given it', () => {
    const h = new LayoutHarness();
    let escaped: UiLayoutChild | undefined;
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 100,
      layout: {
        name: 'leaky',
        layout(children): Size {
          escaped = children[0];
          return { width: 0, height: 0 };
        }
      } satisfies UiLayoutProtocol
    });
    tiles(h, wall, [10]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    expect(escaped).toBeDefined();
    expect(() => escaped!.place(10, 10)).toThrow("outside its own layout call");
    expect(() => escaped!.measure(Constraints.loose(10, 10))).toThrow("outside its own layout call");
  });

  it('refuses a size that is not a number', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 100,
      layout: {
        name: 'infinite',
        layout(): Size {
          return { width: Infinity, height: 0 };
        }
      } satisfies UiLayoutProtocol
    });
    tiles(h, wall, [10]);
    h.append(root, wall);

    expect(() => h.layout(root, Constraints.loose(400, 400))).toThrow("The 'infinite' layout returned Infinity");
  });

  it('refuses a placement that is not a number', () => {
    const h = new LayoutHarness();
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 100,
      layout: {
        name: 'nowhere',
        layout(children): Size {
          children[0].place(Number.NaN, 0);
          return { width: 0, height: 0 };
        }
      } satisfies UiLayoutProtocol
    });
    tiles(h, wall, [10]);
    h.append(root, wall);

    expect(() => h.layout(root, Constraints.loose(400, 400))).toThrow("placed child 0 at (NaN, 0)");
  });

  it('cannot measure or place from explain', () => {
    const h = new LayoutHarness();
    let attempt: (() => void) | undefined;
    const root = node(h, 'page', UiNodeType.Column);
    const wall = node(h, 'wall', UiNodeType.Box, {
      width: 100,
      layout: {
        name: 'nosy',
        layout(): Size {
          return { width: 0, height: 0 };
        },
        explain(children) {
          attempt = () => children[0].place(5, 5);
          return ['nothing to say'];
        }
      } satisfies UiLayoutProtocol
    });
    tiles(h, wall, [10]);
    h.append(root, wall);
    h.layout(root, Constraints.loose(400, 400));

    h.engine.explain(wall);
    expect(attempt).toBeDefined();
    expect(attempt!).toThrow('cannot place a child from explain()');
  });
});

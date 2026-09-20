import { Constraints, type Size, type UiLayoutChild, type UiLayoutProtocol } from '@gesso/core';

/**
 * A masonry wall, written against `@gesso/core`'s public exports and
 * nothing else.
 *
 * This is the file custom layout is really about. A
 * masonry is the smallest arrangement that neither flex nor grid can
 * express: items keep their own heights, the columns are equal in
 * width and unequal in length, and where an item goes depends on the
 * heights of everything already placed. Before the custom layout
 * protocol it was written with `position: 'absolute'`, a
 * `ctx.bounds()` subscription per tile, and an arrangement that was
 * always one frame behind the sizes it was arranged from.
 *
 * Everything below is application code. It imports `Constraints`,
 * `Size`, `UiLayoutChild` and `UiLayoutProtocol`, all of which the
 * framework exports; it never sees a node, a record or the engine.
 */

export interface MasonryOptions {
  /** How many columns, when the width allows it. */
  readonly columns: number;
  /** Space between columns and between the items in one. */
  readonly gap: number;
  /** The narrowest a column is allowed to be before a column is dropped. */
  readonly minColumnWidth: number;
}

/**
 * Builds a masonry protocol.
 *
 * Built once per distinct set of options and then held: the protocol
 * goes on the `layout` property, property values are compared with
 * `Object.is`, and a fresh object per render would mark the wall dirty
 * on every frame. The cache below is the whole of what "hold it still"
 * means in practice.
 */
export function masonry(options: MasonryOptions): UiLayoutProtocol {
  const key = `${options.columns}/${options.gap}/${options.minColumnWidth}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const protocol = build(options);
  cache.set(key, protocol);
  return protocol;
}

const cache = new Map<string, UiLayoutProtocol>();

function build(options: MasonryOptions): UiLayoutProtocol {
  const { gap, minColumnWidth } = options;

  /**
   * How many columns fit, and how wide each one is.
   *
   * The count drops rather than the columns getting narrower than
   * `minColumnWidth`, which is what makes the wall work at 400 px as
   * well as at 1400 px without a breakpoint anywhere: the arrangement
   * is a function of the width it is given, and the width it is given
   * is the container's content box.
   */
  const tracks = (available: number): { count: number; width: number } => {
    let count = options.columns;
    while (count > 1 && (available - gap * (count - 1)) / count < minColumnWidth) {
      count--;
    }
    return { count, width: Math.max(0, (available - gap * (count - 1)) / count) };
  };

  /**
   * Which column each item lands in, and how tall each column ends up.
   *
   * The shortest column takes the next item, which is the whole
   * algorithm. Note that each child is measured exactly **once**, at
   * the column width: the loop over children never measures a sibling,
   * which is the rule `MAX_MEASURES_PER_CHILD` enforces and the reason
   * a wall of four hundred tiles costs four hundred measurements
   * rather than a hundred and sixty thousand.
   */
  const arrange = (
    children: readonly UiLayoutChild[],
    width: number,
    count: number,
    /**
     * What to do with each child: measure it and place it while laying
     * out, or read back what it already is while explaining. A handle
     * given to `explain` refuses both of the other two, which is what
     * keeps a question from turning into a second layout.
     */
    live: boolean
  ): { heights: number[]; columnOf: number[] } => {
    const heights = Array.from({ length: count }, () => 0);
    const columnOf: number[] = [];
    for (const child of children) {
      let shortest = 0;
      for (let column = 1; column < count; column++) {
        if (heights[column] < heights[shortest] - 0.001) {
          shortest = column;
        }
      }
      const size = live ? child.measure(new Constraints(width, width, 0, Infinity)) : child.size;
      const top = heights[shortest];
      if (live) {
        child.place(shortest * (width + gap), top);
      }
      columnOf.push(shortest);
      heights[shortest] = top + size.height + gap;
    }
    return { heights, columnOf };
  };

  const height = (heights: readonly number[]): number => Math.max(0, ...heights.map(value => value - gap));

  return {
    name: 'masonry',

    layout(children, constraints): Size {
      // An unbounded width has no columns to divide, so the wall falls
      // back to one column of whatever the items are, exactly as a
      // Column would. Nothing else in the engine behaves differently
      // there and neither should this.
      const available = isFinite(constraints.maxWidth) ? constraints.maxWidth : minColumnWidth;
      const { count, width } = tracks(available);
      const { heights } = arrange(children, width, count, true);
      return { width: available, height: height(heights) };
    },

    /**
     * What the boxes do not say.
     *
     * `LayoutEngine.explain` prints these under the wall's own two
     * axes, and the playground's inspector shows them for whatever the
     * pointer is over. The rule for what belongs here is the same as
     * for the engine's own reasons: say the thing a developer would
     * otherwise have to work out from the numbers. How many columns
     * there are and how wide they came out is not visible in any box;
     * which column is carrying the wall's height is the answer to
     * "why is there a gap at the bottom of that one".
     */
    explain(children, size) {
      const { count, width } = tracks(size.width);
      const { heights, columnOf } = arrange(children, width, count, false);
      const tallest = heights.indexOf(Math.max(...heights));
      const counts = heights.map((_, column) => columnOf.filter(landed => landed === column).length);
      return [
        `${count} column${count === 1 ? '' : 's'} of ${round(width)} px, ${gap} px apart` +
          (count < options.columns ? ` (${options.columns} would be narrower than ${minColumnWidth} px)` : ''),
        `${children.length} items, ${counts.join(' / ')} per column`,
        `column ${tallest + 1} is the tallest at ${round(size.height)} px; the shortest ends ` +
          `${round(size.height - (Math.min(...heights) - gap))} px above the bottom`
      ];
    }
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

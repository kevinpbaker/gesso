import { describe, expect, it } from 'vitest';

import { Box } from '../composition/UiComponents';
import { UiGraph } from '../graph/UiGraph';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import { decorationRect, type DecorationShape } from '../rendering/Decorations';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { UiChild } from '../composition/UiElement';
import { borders } from './decoration';

/**
 * A border per edge, without an engine change.
 *
 * `borderWidth` is one number and `borderColor` one colour, so a node
 * cannot have a heavy bottom edge and a hairline top. The record used
 * to say the only way round that was four child boxes per node, four
 * times the node count on exactly the surfaces that count nodes. It is
 * not: a border in Gesso is paint-only, and a decoration is already a
 * coloured rectangle in the node's own paint pass with nothing to lay
 * out and nothing to hit test. Four edges are four draw instances and
 * no extra nodes.
 *
 * What it needed was somewhere to put them, which is what the far
 * insets on `DecorationBox` are for.
 */
const BOX = { x: 0, y: 0, width: 100, height: 50 } as unknown as LayoutRecord;

function shapesOf(modifier: ReturnType<typeof borders>): readonly DecorationShape[] {
  const graph = new UiGraph();
  new UiGraphBuilder(graph).reconcileChildren(graph.root, [Box({ modifiers: [modifier] }) as UiChild]);
  return graph.root.firstChild!.decorations ?? [];
}

/** Each edge as the rectangle it actually paints. */
function rectsOf(modifier: ReturnType<typeof borders>) {
  return shapesOf(modifier).map(shape => {
    const { x, y, width, height } = decorationRect(shape, BOX, 0);
    return { x, y, width, height };
  });
}

describe('borders', () => {
  it('draws only the edges it is given', () => {
    expect(shapesOf(borders({ bottom: 2 }))).toHaveLength(1);
    expect(shapesOf(borders({ top: 1, bottom: 1 }))).toHaveLength(2);
    expect(shapesOf(borders({ top: 1, right: 1, bottom: 1, left: 1 }))).toHaveLength(4);
  });

  it('skips an edge of zero width rather than drawing nothing somewhere', () => {
    expect(shapesOf(borders({ top: 0, bottom: 2 }))).toHaveLength(1);
  });

  it('puts each edge inside the box, where borderWidth puts one', () => {
    const [top, bottom, left, right] = rectsOf(borders({ top: 1, right: 4, bottom: 2, left: 3 }));

    expect(top).toEqual({ x: 0, y: 0, width: 100, height: 1 });
    expect(bottom).toEqual({ x: 0, y: 48, width: 100, height: 2 });
    // The sides run between the horizontal edges, so the corners are
    // painted once rather than twice.
    expect(left).toEqual({ x: 0, y: 1, width: 3, height: 47 });
    expect(right).toEqual({ x: 96, y: 1, width: 4, height: 47 });
  });

  it('runs a side the full height when there is no edge for it to meet', () => {
    const [left] = rectsOf(borders({ left: 2 }));

    expect(left).toEqual({ x: 0, y: 0, width: 2, height: 50 });
  });

  it('shares one colour and lets an edge name its own', () => {
    const shapes = shapesOf(borders({ top: 1, bottom: { width: 2, color: 'accent' }, color: 'border' }));

    expect(shapes.map(shape => shape.color)).toEqual(['border', 'accent']);
  });

  it('defaults to the border token, so a grid line needs no colour at all', () => {
    expect(shapesOf(borders({ bottom: 1 }))[0]?.color).toBe('border');
  });

  it('squares its corners, because four rectangles meeting at a radius is not a border', () => {
    // A rounded box wants the single `borderWidth`, which both
    // renderers draw as one band and get right.
    for (const shape of shapesOf(borders({ top: 1, right: 1, bottom: 1, left: 1 }))) {
      expect(shape.radius).toBe(0);
    }
  });

  it('costs four draw instances and no nodes', () => {
    const graph = new UiGraph();
    new UiGraphBuilder(graph).reconcileChildren(graph.root, [
      Box({ modifiers: [borders({ top: 1, right: 1, bottom: 1, left: 1 })] }) as UiChild
    ]);
    const node = graph.root.firstChild!;

    expect(node.firstChild).toBeNull();
    expect(node.decorations).toHaveLength(4);
  });
});

import { describe, expect, it } from 'vitest';

import { UiNodeType, type UiNode } from 'gesso-core';
import { intersect, islandGeometry, subtractRects, type IslandGeometrySource } from './islandGeometry';
import type { IslandRect } from './IslandProtocol';

/**
 * A tree of stand-in nodes with a box each, and the flags the geometry
 * reads from a layout record. Just the parts of `UiNode` and
 * `LayoutEngine` that `islandGeometry` touches.
 */
interface FakeNode {
  id: string;
  type: UiNodeType;
  parent: FakeNode | null;
  firstChild: FakeNode | null;
  nextSibling: FakeNode | null;
  properties: Map<string, unknown>;
  box: IslandRect;
  clips: boolean;
  scrollable: boolean;
  lifted: boolean;
}

function node(
  id: string,
  box: IslandRect,
  children: FakeNode[] = [],
  flags: Partial<Pick<FakeNode, 'clips' | 'scrollable' | 'lifted' | 'type'>> & { props?: Record<string, unknown> } = {}
): FakeNode {
  const made: FakeNode = {
    id,
    type: flags.type ?? UiNodeType.Box,
    parent: null,
    firstChild: children[0] ?? null,
    nextSibling: null,
    properties: new Map(Object.entries(flags.props ?? {})),
    box,
    clips: flags.clips ?? false,
    scrollable: flags.scrollable ?? false,
    lifted: flags.lifted ?? false
  };
  children.forEach((child, index) => {
    child.parent = made;
    child.nextSibling = children[index + 1] ?? null;
  });
  return made;
}

const rect = (x: number, y: number, width: number, height: number): IslandRect => ({ x, y, width, height });

function source(sticky: FakeNode[] = []): IslandGeometrySource {
  return {
    recordFor: target => {
      const fake = target as unknown as FakeNode;
      return {
        width: fake.box.width,
        height: fake.box.height,
        clips: fake.clips,
        lifted: fake.lifted,
        scrollable: fake.scrollable
      };
    },
    screenBox: target => (target as unknown as FakeNode).box,
    allStickyNodes: () => new Set(sticky as unknown as UiNode[])
  };
}

const VIEWPORT = rect(0, 0, 800, 600);
const as = (fake: FakeNode): UiNode => fake as unknown as UiNode;

describe('islandGeometry', () => {
  it('clips to every clipping ancestor and the viewport', () => {
    const field = node('field', rect(50, 80, 200, 40));
    node('root', VIEWPORT, [node('scroller', rect(0, 100, 400, 300), [field], { clips: true, scrollable: true })]);
    const geometry = islandGeometry(as(field), source(), VIEWPORT, []);
    expect(geometry.visible).toBe(true);
    expect(geometry.clip).toEqual(rect(0, 100, 400, 300));
  });

  it('is not visible when clipped away, under visible: false, or at zero opacity', () => {
    const away = node('away', rect(50, 20, 200, 40));
    node('scroller', rect(0, 100, 400, 300), [away], { clips: true });
    expect(islandGeometry(as(away), source(), VIEWPORT, []).visible).toBe(false);

    const hidden = node('hidden', rect(0, 0, 10, 10));
    node('wrap', VIEWPORT, [hidden], { props: { visible: false } });
    expect(islandGeometry(as(hidden), source(), VIEWPORT, []).visible).toBe(false);

    const faded = node('faded', rect(0, 0, 10, 10));
    node('wrap', VIEWPORT, [node('inner', VIEWPORT, [faded], { props: { opacity: 0.5 } })], { props: { opacity: 0 } });
    expect(islandGeometry(as(faded), source(), VIEWPORT, []).visible).toBe(false);
  });

  it('multiplies the opacity of its ancestors', () => {
    const field = node('field', rect(0, 0, 10, 10), [], { props: { opacity: 0.5 } });
    node('wrap', VIEWPORT, [node('inner', VIEWPORT, [field], { props: { opacity: 0.5 } })]);
    expect(islandGeometry(as(field), source(), VIEWPORT, []).opacity).toBe(0.25);
  });

  it('stops clipping at a lifted ancestor, which paints outside the clips above it', () => {
    const field = node('field', rect(50, 500, 100, 20));
    node('scroller', rect(0, 0, 400, 100), [node('lifted', rect(0, 400, 400, 200), [field], { lifted: true })], {
      clips: true
    });
    expect(islandGeometry(as(field), source(), VIEWPORT, []).visible).toBe(true);
  });

  it('is cut by the entries of an overlay layer it is not in', () => {
    const field = node('field', rect(100, 100, 200, 40));
    const menu = node('menu', rect(150, 120, 100, 200), [node('item', rect(150, 120, 100, 20))]);
    const layer = node('layer', VIEWPORT, [node('fragment', VIEWPORT, [menu], { type: UiNodeType.Fragment })]);
    node('root', VIEWPORT, [node('page', VIEWPORT, [field]), layer]);
    const geometry = islandGeometry(as(field), source(), VIEWPORT, [as(layer)]);
    expect(geometry.cuts).toEqual([rect(150, 120, 100, 20)]);
    expect(geometry.inert).toBe(false);
  });

  it('inside a layer, is cut only by the entries after its own', () => {
    const field = node('field', rect(100, 100, 200, 40));
    const before = node('before', rect(0, 0, 800, 600), [node('x', rect(0, 0, 1, 1))]);
    const dialog = node('dialog', rect(50, 50, 400, 300), [field]);
    const after = node('after', rect(120, 110, 50, 50), [node('y', rect(0, 0, 1, 1))]);
    const layer = node('layer', VIEWPORT, [before, dialog, after]);
    const geometry = islandGeometry(as(field), source(), VIEWPORT, [as(layer)]);
    expect(geometry.cuts).toEqual([rect(120, 110, 50, 30)]);
  });

  it('is made inert, not cut, by a backdrop that paints nothing', () => {
    const field = node('field', rect(100, 100, 200, 40));
    const backdrop = node('backdrop', VIEWPORT);
    const scrim = node('scrim', VIEWPORT, [], { props: { backgroundColor: 'scrim' } });
    const layer = node('layer', VIEWPORT, [backdrop]);
    node('root', VIEWPORT, [node('page', VIEWPORT, [field]), layer]);
    const geometry = islandGeometry(as(field), source(), VIEWPORT, [as(layer)]);
    expect(geometry).toMatchObject({ visible: true, cuts: [], inert: true });

    const modal = node('layer', VIEWPORT, [scrim]);
    const covered = islandGeometry(as(field), source(), VIEWPORT, [as(modal)]);
    expect(covered.cuts).toEqual([rect(100, 100, 200, 40)]);
  });

  it('is cut by a sticky node its own scroll container scrolls, and not by one elsewhere', () => {
    const field = node('field', rect(100, 30, 200, 40));
    const header = node('header', rect(0, 0, 400, 50));
    const content = node('content', rect(0, 0, 400, 1000), [header, field]);
    node('scroller', rect(0, 0, 400, 300), [content], { clips: true, scrollable: true });
    const elsewhere = node('elsewhere', rect(0, 0, 800, 60));
    node('other', rect(0, 0, 800, 600), [elsewhere], { clips: true, scrollable: true });
    const geometry = islandGeometry(as(field), source([header, elsewhere]), VIEWPORT, []);
    expect(geometry.cuts).toEqual([rect(100, 30, 200, 20)]);
  });
});

describe('subtractRects', () => {
  it('leaves what two overlapping holes do not cover, and nothing twice', () => {
    const from = rect(0, 0, 100, 100);
    const pieces = subtractRects(from, [rect(10, 10, 50, 50), rect(40, 40, 50, 50)]);
    const area = pieces.reduce((sum, piece) => sum + piece.width * piece.height, 0);
    // 10000 less the union of two 2500 squares that share 400.
    expect(area).toBe(10000 - (2500 + 2500 - 400));
    for (let a = 0; a < pieces.length; a += 1) {
      for (let b = a + 1; b < pieces.length; b += 1) {
        expect(intersect(pieces[a]!, pieces[b]!)).toBeNull();
      }
    }
  });

  it('is empty when a hole covers it, and whole when none touches it', () => {
    expect(subtractRects(rect(0, 0, 10, 10), [rect(-5, -5, 30, 30)])).toEqual([]);
    expect(subtractRects(rect(0, 0, 10, 10), [rect(20, 20, 5, 5)])).toEqual([rect(0, 0, 10, 10)]);
  });
});

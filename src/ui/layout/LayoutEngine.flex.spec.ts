import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

describe('LayoutEngine flex (Row/Column)', () => {
  function columnHarness(children: Array<{ id: string; width: number; height: number }>) {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Column);
    for (const c of children) {
      const node = harness.createNode(c.id, UiNodeType.Box);
      node.setProperty('width', c.width);
      node.setProperty('height', c.height);
      harness.append(root, node);
    }
    harness.layout(root, Constraints.loose(300, 200));
    return { harness, root };
  }

  describe('measurement', () => {
    it('measures the column as the max cross size and summed main size', () => {
      const { harness, root } = columnHarness([
        { id: 'a', width: 40, height: 20 },
        { id: 'b', width: 60, height: 30 }
      ]);
      const rec = harness.record(root);
      expect(rec.measuredWidth).toBe(60);
      expect(rec.measuredHeight).toBe(50);
    });

    it('accounts for gap in the main axis', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('gap', 10);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('height', 20);
      b.setProperty('height', 30);
      harness.append(root, a, b);
      harness.layout(root, Constraints.unbounded());
      expect(harness.record(root).measuredHeight).toBe(60);
    });

    it('measures a row cross axis from the tallest child', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Row);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      b.setProperty('width', 60);
      b.setProperty('height', 30);
      harness.append(root, a, b);
      harness.layout(root, Constraints.unbounded());
      const rec = harness.record(root);
      expect(rec.measuredWidth).toBe(100);
      expect(rec.measuredHeight).toBe(30);
    });
  });

  describe('main axis placement', () => {
    it('stacks column children from the top', () => {
      const { harness } = columnHarness([
        { id: 'a', width: 40, height: 20 },
        { id: 'b', width: 60, height: 30 }
      ]);
      expect(harness.box(harness.graph.requireNode('a'))).toEqual({ x: 0, y: 0, width: 40, height: 20 });
      expect(harness.box(harness.graph.requireNode('b'))).toEqual({ x: 0, y: 20, width: 60, height: 30 });
    });

    it('lays out row children from the left', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Row);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      b.setProperty('width', 60);
      b.setProperty('height', 30);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a)).toEqual({ x: 0, y: 0, width: 40, height: 20 });
      expect(harness.box(b)).toEqual({ x: 40, y: 0, width: 60, height: 30 });
    });

    it('applies gap between children', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('gap', 10);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('height', 20);
      b.setProperty('height', 30);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).y).toBe(0);
      expect(harness.box(b).y).toBe(30);
    });

    it('offsets content by padding', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('padding', 10);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('height', 20);
      b.setProperty('height', 30);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a)).toEqual({ x: 10, y: 10, width: 0, height: 20 });
      expect(harness.box(b)).toEqual({ x: 10, y: 30, width: 0, height: 30 });
    });
  });

  describe('flex grow and shrink', () => {
    it('distributes free space to a growing child', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Row);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      b.setProperty('width', 60);
      b.setProperty('height', 30);
      b.setProperty('flexGrow', 1);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a)).toEqual({ x: 0, y: 0, width: 40, height: 20 });
      expect(harness.box(b)).toEqual({ x: 40, y: 0, width: 260, height: 30 });
    });

    it('distributes free space proportionally to grow weights', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Row);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('flexGrow', 1);
      b.setProperty('flexGrow', 2);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).width).toBe(100);
      expect(harness.box(b).width).toBe(200);
    });

    it('shrinks children to fit overflow', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Row);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 60);
      a.setProperty('height', 20);
      b.setProperty('width', 60);
      b.setProperty('height', 20);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(100, 50));
      expect(harness.box(a)).toEqual({ x: 0, y: 0, width: 50, height: 20 });
      expect(harness.box(b)).toEqual({ x: 50, y: 0, width: 50, height: 20 });
    });

    it('respects flexShrink zero', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Row);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 60);
      a.setProperty('height', 20);
      b.setProperty('width', 60);
      b.setProperty('height', 20);
      b.setProperty('flexShrink', 0);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(100, 50));
      expect(harness.box(a).width).toBe(40);
      expect(harness.box(b).width).toBe(60);
    });

    it('applies flexBasis on the main axis', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Row);
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('width', 200);
      a.setProperty('height', 20);
      a.setProperty('flexBasis', 100);
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).width).toBe(100);
    });
  });

  describe('justify content', () => {
    it('centers on the main axis', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('justifyContent', 'center');
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a)).toEqual({ x: 0, y: 90, width: 40, height: 20 });
    });

    it('pins to the end', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('justifyContent', 'end');
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('height', 20);
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).y).toBe(180);
    });

    it('spaces children evenly', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('justifyContent', 'space-evenly');
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('height', 20);
      b.setProperty('height', 30);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).y).toBeCloseTo(50);
      expect(harness.box(b).y).toBeCloseTo(120);
    });

    it('splits space between children', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('justifyContent', 'space-between');
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('height', 20);
      b.setProperty('height', 30);
      harness.append(root, a, b);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).y).toBe(0);
      expect(harness.box(b).y).toBe(170);
    });

    it('leaves space around children', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('justifyContent', 'space-around');
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('height', 20);
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).y).toBeCloseTo(90);
    });
  });

  describe('cross axis alignment', () => {
    it('defaults to start', () => {
      const { harness } = columnHarness([{ id: 'a', width: 40, height: 20 }]);
      expect(harness.box(harness.graph.requireNode('a')).x).toBe(0);
    });

    it('centers with alignItems', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('alignItems', 'center');
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).x).toBe(130);
    });

    it('pins to the end with alignItems', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('alignItems', 'end');
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).x).toBe(260);
    });

    it('stretches to the cross size', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('alignItems', 'stretch');
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('height', 20);
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a)).toEqual({ x: 0, y: 0, width: 300, height: 20 });
    });

    it('aligns a row child vertically to center', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Row);
      root.setProperty('alignItems', 'center');
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).y).toBe(90);
    });

    it('overrides alignItems with alignSelf', () => {
      const harness = new LayoutHarness();
      const root = harness.createNode('app', UiNodeType.Column);
      root.setProperty('alignItems', 'start');
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      a.setProperty('alignSelf', 'end');
      harness.append(root, a);
      harness.layout(root, Constraints.loose(300, 200));
      expect(harness.box(a).x).toBe(260);
    });
  });

  describe('nested flex', () => {
    it('lays out a column inside a row', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      const column = harness.createNode('column', UiNodeType.Column);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 20);
      a.setProperty('height', 20);
      b.setProperty('width', 20);
      b.setProperty('height', 20);
      harness.append(column, a, b);
      harness.append(row, column);
      harness.layout(row, Constraints.loose(300, 200));
      expect(harness.box(a)).toEqual({ x: 0, y: 0, width: 20, height: 20 });
      expect(harness.box(b)).toEqual({ x: 0, y: 20, width: 20, height: 20 });
    });

    it('computes nested world boxes through multiple levels', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('marginLeft', 25);
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('width', 20);
      a.setProperty('height', 20);
      harness.append(column, a);
      harness.append(row, column);
      harness.layout(row, Constraints.loose(300, 200));
      expect(harness.boxOf(a)).toEqual({ x: 25, y: 0, width: 20, height: 20 });
    });
  });
});

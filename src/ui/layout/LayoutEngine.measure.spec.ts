import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

describe('LayoutEngine measurement', () => {
  function boxHarness(id = 'box') {
    const harness = new LayoutHarness();
    const node = harness.createNode(id, UiNodeType.Box);
    return { harness, node };
  }

  describe('fixed sizes', () => {
    it('measures an explicit width and height', () => {
      const { harness, node } = boxHarness();
      node.setProperty('width', 100);
      node.setProperty('height', 50);
      harness.layout(node);
      expect(harness.record(node).measuredWidth).toBe(100);
      expect(harness.record(node).measuredHeight).toBe(50);
    });

    it('measures an explicit width with intrinsic height', () => {
      const { harness, node } = boxHarness();
      node.setProperty('width', 80);
      harness.layout(node);
      expect(harness.record(node).measuredWidth).toBe(80);
      expect(harness.record(node).measuredHeight).toBe(0);
    });
  });

  describe('min and max', () => {
    it('applies minWidth to a zero intrinsic size', () => {
      const { harness, node } = boxHarness();
      node.setProperty('minWidth', 50);
      harness.layout(node);
      expect(harness.record(node).measuredWidth).toBe(50);
    });

    it('applies maxWidth by shrinking a fixed size', () => {
      const { harness, node } = boxHarness();
      node.setProperty('width', 100);
      node.setProperty('maxWidth', 30);
      harness.layout(node);
      expect(harness.record(node).measuredWidth).toBe(30);
    });

    it('applies min and max on both axes', () => {
      const { harness, node } = boxHarness();
      node.setProperty('minHeight', 40);
      node.setProperty('maxHeight', 80);
      harness.layout(node);
      expect(harness.record(node).measuredHeight).toBe(40);
    });
  });

  describe('intrinsic size', () => {
    it('measures text from the text measurer', () => {
      const harness = new LayoutHarness();
      const node = harness.createNode('text', UiNodeType.Text);
      node.setProperty('text', 'Hello');
      node.setProperty('fontSize', 10);
      harness.layout(node);
      expect(harness.record(node).measuredWidth).toBe(30);
      expect(harness.record(node).measuredHeight).toBe(12);
    });

    it('constrains text width with maxWidth', () => {
      const harness = new LayoutHarness();
      const node = harness.createNode('text', UiNodeType.Text);
      node.setProperty('text', 'Hello World');
      node.setProperty('fontSize', 10);
      harness.layout(node, Constraints.tight(20, 100));
      expect(harness.record(node).measuredWidth).toBe(20);
    });

    it('measures a button like text', () => {
      const harness = new LayoutHarness();
      const node = harness.createNode('button', UiNodeType.Button);
      node.setProperty('text', 'Save');
      node.setProperty('fontSize', 10);
      harness.layout(node);
      expect(harness.record(node).measuredWidth).toBe(24);
    });

    it('measures a plain box as zero', () => {
      const { harness, node } = boxHarness();
      harness.layout(node);
      expect(harness.record(node).measuredWidth).toBe(0);
      expect(harness.record(node).measuredHeight).toBe(0);
    });
  });

  describe('unconstrained and constrained dimensions', () => {
    it('sizes to content under unbounded constraints', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      b.setProperty('width', 60);
      b.setProperty('height', 30);
      harness.append(column, a, b);
      harness.layout(column, Constraints.unbounded());
      const rec = harness.record(column);
      expect(rec.measuredWidth).toBe(60);
      expect(rec.measuredHeight).toBe(50);
    });

    it('overflows a loose parent bound its content cannot fit', () => {
      // A loose max is the available space, not a clamp: like CSS
      // fit-content, a child with an explicit 60 width makes the
      // column 60 wide inside a 50 slot rather than being squeezed.
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 20);
      b.setProperty('width', 60);
      b.setProperty('height', 30);
      harness.append(column, a, b);
      harness.layout(column, new Constraints(0, 50, 0, Infinity));
      expect(harness.record(column).measuredWidth).toBe(60);
      expect(harness.record(column).measuredHeight).toBe(50);
    });

    it('clamps to its own maxWidth', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('maxWidth', 50);
      const b = harness.createNode('b', UiNodeType.Box);
      b.setProperty('width', 60);
      b.setProperty('height', 30);
      harness.append(column, b);
      harness.layout(column, Constraints.unbounded());
      expect(harness.record(column).measuredWidth).toBe(50);
    });

    it('obeys a tight parent bound over its content', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      const b = harness.createNode('b', UiNodeType.Box);
      b.setProperty('width', 60);
      harness.append(column, b);
      harness.layout(column, new Constraints(50, 50, 0, Infinity));
      expect(harness.record(column).measuredWidth).toBe(50);
    });

    it('fills tight constraints when placed as the layout root', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      harness.layout(column, Constraints.tight(300, 200));
      expect(harness.record(column).measuredWidth).toBe(300);
      expect(harness.record(column).width).toBe(300);
      expect(harness.record(column).height).toBe(200);
    });
  });
});

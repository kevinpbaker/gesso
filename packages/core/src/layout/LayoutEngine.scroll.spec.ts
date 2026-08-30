import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

describe('LayoutEngine scrolling', () => {
  function scrollHarness(direction?: string) {
    const harness = new LayoutHarness();
    const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    if (direction !== undefined) {
      scroll.setProperty('direction', direction);
    }
    for (const c of ['a', 'b', 'c']) {
      const node = harness.createNode(c, UiNodeType.Box);
      node.setProperty('width', direction === 'row' ? 100 : 40);
      node.setProperty('height', 50);
      node.setProperty('flexShrink', 0);
      harness.append(scroll, node);
    }
    harness.layout(scroll, Constraints.tight(200, 100));
    return { harness, scroll };
  }

  describe('vertical', () => {
    it('reports content height beyond the viewport', () => {
      const { harness, scroll } = scrollHarness();
      const result = harness.layout(scroll, Constraints.tight(200, 100));
      expect(result.contentHeight).toBe(150);
      expect(result.contentWidth).toBe(40);
      expect(result.clip).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    });

    it('stacks children in content coordinates', () => {
      const { harness } = scrollHarness();
      const a = harness.graph.requireNode('a');
      const b = harness.graph.requireNode('b');
      const c = harness.graph.requireNode('c');
      expect(harness.box(a)).toEqual({ x: 0, y: 0, width: 40, height: 50 });
      expect(harness.box(b)).toEqual({ x: 0, y: 50, width: 40, height: 50 });
      expect(harness.box(c)).toEqual({ x: 0, y: 100, width: 40, height: 50 });
    });

    it('does not shrink content into the viewport without flexShrink', () => {
      const harness = new LayoutHarness();
      const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
      scroll.setProperty('width', 200);
      scroll.setProperty('height', 100);
      for (const c of ['a', 'b', 'c']) {
        const node = harness.createNode(c, UiNodeType.Box);
        node.setProperty('width', 40);
        node.setProperty('height', 50);
        harness.append(scroll, node);
      }
      harness.layout(scroll, Constraints.tight(200, 100));
      expect(harness.box(harness.graph.requireNode('a'))).toEqual({ x: 0, y: 0, width: 40, height: 50 });
      expect(harness.box(harness.graph.requireNode('b')).y).toBe(50);
      expect(harness.box(harness.graph.requireNode('c')).y).toBe(100);
    });

    it('scrolls content within the viewport', () => {
      const { harness, scroll } = scrollHarness();
      scroll.setProperty('scrollY', 40);
      const result = harness.layout(scroll, Constraints.tight(200, 100));
      expect(result.scrollY).toBe(40);
      expect(result.scrollX).toBe(0);
      expect(harness.engine.contentWindow(scroll)).toEqual({ x: 0, y: 40, width: 200, height: 100 });
      expect(result.clip).toEqual({ x: 0, y: 40, width: 200, height: 100 });
    });

    it('clamps scroll beyond the content edge', () => {
      const { harness, scroll } = scrollHarness();
      scroll.setProperty('scrollY', 500);
      const result = harness.layout(scroll, Constraints.tight(200, 100));
      expect(result.scrollY).toBe(50);
    });

    it('ignores negative scroll offsets', () => {
      const { harness, scroll } = scrollHarness();
      scroll.setProperty('scrollY', -30);
      const result = harness.layout(scroll, Constraints.tight(200, 100));
      expect(result.scrollY).toBe(0);
    });

    it('keeps child boxes in content coordinates while scrolled', () => {
      const { harness, scroll } = scrollHarness();
      scroll.setProperty('scrollY', 40);
      harness.layout(scroll, Constraints.tight(200, 100));
      expect(harness.boxOf(harness.graph.requireNode('a')).y).toBe(0);
      expect(harness.boxOf(harness.graph.requireNode('b')).y).toBe(50);
    });
  });

  describe('horizontal', () => {
    it('reports content width beyond the viewport', () => {
      const { harness } = scrollHarness('row');
      const result = harness.layout(harness.graph.requireNode('scroll'), Constraints.tight(200, 100));
      expect(result.contentWidth).toBe(300);
      expect(result.contentHeight).toBe(50);
    });

    it('lays children out left to right', () => {
      const { harness } = scrollHarness('row');
      const a = harness.graph.requireNode('a');
      const b = harness.graph.requireNode('b');
      expect(harness.box(a).x).toBe(0);
      expect(harness.box(b).x).toBe(100);
    });

    it('scrolls horizontally and clamps to the content edge', () => {
      const { harness, scroll } = scrollHarness('row');
      scroll.setProperty('scrollX', 500);
      const result = harness.layout(scroll, Constraints.tight(200, 100));
      expect(result.scrollX).toBe(100);
      expect(harness.engine.contentWindow(scroll)).toEqual({ x: 100, y: 0, width: 200, height: 100 });
    });
  });

  describe('sizing', () => {
    it('sizes to content when unbounded', () => {
      const harness = new LayoutHarness();
      const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
      const a = harness.createNode('a', UiNodeType.Box);
      const b = harness.createNode('b', UiNodeType.Box);
      a.setProperty('width', 40);
      a.setProperty('height', 50);
      b.setProperty('width', 40);
      b.setProperty('height', 50);
      harness.append(scroll, a, b);
      harness.layout(scroll, Constraints.unbounded());
      const rec = harness.record(scroll);
      expect(rec.width).toBe(40);
      expect(rec.height).toBe(100);
      expect(rec.contentHeight).toBe(100);
    });

    it('clamps scroll when the content fits', () => {
      const harness = new LayoutHarness();
      const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
      scroll.setProperty('width', 200);
      scroll.setProperty('height', 100);
      scroll.setProperty('scrollY', 80);
      const a = harness.createNode('a', UiNodeType.Box);
      a.setProperty('height', 50);
      a.setProperty('flexShrink', 0);
      harness.append(scroll, a);
      harness.layout(scroll, Constraints.tight(200, 100));
      expect(harness.engine.contentWindow(scroll)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    });
  });
});

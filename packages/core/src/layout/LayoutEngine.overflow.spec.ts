import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { DirtyFlags } from '../graph/DirtyFlags';
import { UiFrame } from '../scheduler/UiFrame';
import { UiHitTester } from '../input/UiHitTester';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { SCROLLBAR_FADE_MS, SCROLLBAR_LINGER_MS } from './LayoutEngine';

/**
 * Overflow, scrolling and sticky (roadmap L4): any container can clip
 * or scroll, sticky nodes hold at the scrollport edge, visible boxes
 * account for both, and reveal adjustments bring a node on screen.
 */
describe('LayoutEngine overflow', () => {
  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }
  const box = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) => node(h, id, UiNodeType.Box, props);
  const column = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) =>
    node(h, id, UiNodeType.Column, props);

  describe('overflow', () => {
    it('marks hidden containers as clipping and scroll containers as scrollable', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const hidden = box(h, 'hidden', { width: 50, height: 50, overflow: 'hidden' });
      const scroll = column(h, 'scroll', { width: 50, height: 50, overflow: 'scroll' });
      const plain = box(h, 'plain', { width: 50, height: 50 });
      h.append(root, hidden, scroll, plain);
      h.layout(root, Constraints.loose(300, 300));
      expect(h.record(hidden)).toMatchObject({ clips: true, scrollable: false });
      expect(h.record(scroll)).toMatchObject({ clips: true, scrollable: true });
      expect(h.record(plain)).toMatchObject({ clips: false, scrollable: false });
    });

    it('measures the content extent of a scroll container from its placed children', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { height: 40, overflow: 'scroll', x: 'start', padding: 5 });
      const a = box(h, 'a', { width: 20, height: 30, flexShrink: 0 });
      const b = box(h, 'b', { width: 60, height: 30, flexShrink: 0 });
      h.append(root, a, b);
      h.layout(root, Constraints.loose(300, 300));
      expect(h.record(root).contentHeight).toBe(70);
      expect(h.record(root).contentWidth).toBe(70);
    });

    it('clamps scroll offsets to the content extent and translates visible boxes', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { height: 40, overflow: 'scroll', scrollY: 500, x: 'start' });
      const a = box(h, 'a', { width: 20, height: 30, flexShrink: 0 });
      const b = box(h, 'b', { width: 20, height: 30, flexShrink: 0 });
      h.append(root, a, b);
      h.layout(root, Constraints.loose(300, 300));
      expect(h.record(root).scrollY).toBe(20);
      expect(h.box(b).y).toBe(30);
      expect(h.visibleBox(b).y).toBe(10);
    });

    it('shows scrollbars for a while after scrolling and says when they change', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { height: 40, overflow: 'scroll', scrollY: 10, x: 'start' });
      h.append(root, box(h, 'a', { width: 20, height: 100, flexShrink: 0 }));
      h.layout(root, Constraints.loose(300, 300));
      const until = h.record(root).scrollbarVisibleUntil;
      const now = until - SCROLLBAR_LINGER_MS;
      expect(h.engine.nextScrollbarChange(now)).toBe(until - SCROLLBAR_FADE_MS);
      expect(h.engine.nextScrollbarChange(until - 10)).toBe(until - 10 + 16);
      expect(h.engine.nextScrollbarChange(until + 1)).toBeUndefined();
    });
  });

  describe('sticky', () => {
    function scrolledList(scrollY: number, stickyProps: Record<string, unknown> = { top: 0 }) {
      const h = new LayoutHarness();
      const root = column(h, 'top', { height: 60, overflow: 'scroll', scrollY, x: 'start' });
      const header = box(h, 'header', { position: 'sticky', width: 20, height: 10, flexShrink: 0, ...stickyProps });
      const body = box(h, 'body', { width: 20, height: 200, flexShrink: 0 });
      h.append(root, header, body);
      h.layout(root, Constraints.loose(300, 300));
      return { h, root, header, body };
    }

    it('stays in flow until scrolling reaches it', () => {
      const { h, header } = scrolledList(0);
      expect(h.record(header).stickyOffsetY).toBe(0);
      expect(h.visibleBox(header).y).toBe(0);
    });

    it('holds at the scrollport top while the content scrolls under it', () => {
      const { h, header, body } = scrolledList(30);
      expect(h.record(header).stickyOffsetY).toBe(30);
      expect(h.visibleBox(header).y).toBe(0);
      expect(h.visibleBox(body).y).toBe(-20);
    });

    it('honours a top inset', () => {
      const { h, header } = scrolledList(30, { top: 5 });
      expect(h.visibleBox(header).y).toBe(5);
    });

    it('leaves with its parent once the parent scrolls away', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { height: 60, overflow: 'scroll', scrollY: 50, x: 'start' });
      const group = column(h, 'group', { x: 'start', flexShrink: 0 });
      const header = box(h, 'header', { position: 'sticky', top: 0, width: 20, height: 10 });
      const inner = box(h, 'inner', { width: 20, height: 30 });
      h.append(group, header, inner);
      const rest = box(h, 'rest', { width: 20, height: 200, flexShrink: 0 });
      h.append(root, group, rest);
      h.layout(root, Constraints.loose(300, 300));
      // The group is 40 tall; the header can travel 30 within it.
      expect(h.record(header).stickyOffsetY).toBe(30);
      expect(h.visibleBox(header).y).toBe(-20);
    });

    it('follows scroll-only frames', () => {
      const { h, root, header } = scrolledList(0);
      root.setProperty('scrollY', 40);
      h.engine.layoutForFrame(new UiFrame(1, 0, new Map([[root, DirtyFlags.Transform]])), Constraints.loose(300, 300));
      expect(h.visibleBox(header).y).toBe(0);
      expect(h.record(header).stickyOffsetY).toBe(40);
    });
  });

  describe('reveal adjustments', () => {
    it('scrolls a container just enough to show a node below the viewport', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { height: 50, overflow: 'scroll', x: 'start' });
      const rows = [0, 1, 2, 3].map(i => box(h, `r${i}`, { width: 20, height: 20, flexShrink: 0 }));
      h.append(root, ...rows);
      h.layout(root, Constraints.loose(300, 300));
      expect(h.engine.revealAdjustments(rows[0])).toEqual([]);
      // Row 2 spans 40..60 in a 50-tall viewport: scroll by 10 (+ padding).
      expect(h.engine.revealAdjustments(rows[2], 4)).toEqual([{ container: root, scrollX: 0, scrollY: 14 }]);
    });

    it('scrolls back up for a node above the viewport, clamped at zero', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { height: 50, overflow: 'scroll', scrollY: 30, x: 'start' });
      const rows = [0, 1, 2, 3].map(i => box(h, `r${i}`, { width: 20, height: 20, flexShrink: 0 }));
      h.append(root, ...rows);
      h.layout(root, Constraints.loose(300, 300));
      expect(h.engine.revealAdjustments(rows[0], 8)).toEqual([{ container: root, scrollX: 0, scrollY: 0 }]);
    });

    it('adjusts every scroll ancestor, innermost first', () => {
      const h = new LayoutHarness();
      const outer = column(h, 'outer', { height: 50, overflow: 'scroll', x: 'start' });
      const spacer = box(h, 'spacer', { width: 20, height: 100, flexShrink: 0 });
      const inner = column(h, 'inner', { height: 30, overflow: 'scroll', x: 'start', flexShrink: 0 });
      const rows = [0, 1, 2].map(i => box(h, `r${i}`, { width: 20, height: 20, flexShrink: 0 }));
      h.append(inner, ...rows);
      h.append(outer, spacer, inner);
      h.layout(outer, Constraints.loose(300, 300));
      const adjustments = h.engine.revealAdjustments(rows[2]);
      expect(adjustments.map(a => a.container)).toEqual([inner, outer]);
      // Row 2 sits at 40..60 inside the 30-tall inner: inner scrolls 30.
      expect(adjustments[0].scrollY).toBe(30);
      // The row then sits at outer content y 100 + 40 - 30 = 110..130;
      // the outer viewport is 50 tall, so it scrolls to 80.
      expect(adjustments[1].scrollY).toBe(80);
    });
  });

  describe('hit testing', () => {
    it('does not hit children outside a hidden-overflow box, and honours sticky shifts', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { x: 'start' });
      const clipped = box(h, 'clipped', { width: 50, height: 50, overflow: 'hidden' });
      const spill = box(h, 'spill', { width: 200, height: 20 });
      h.append(clipped, spill);
      // Wide enough that the scrollbar band along the right edge stays
      // clear of the points tested.
      const list = column(h, 'list', { width: 200, height: 60, overflow: 'scroll', scrollY: 30, x: 'start' });
      const header = box(h, 'header', { position: 'sticky', top: 0, width: 20, height: 10, flexShrink: 0 });
      const body = box(h, 'body', { width: 20, height: 200, flexShrink: 0 });
      h.append(list, header, body);
      h.append(root, clipped, list);
      h.layout(root, Constraints.loose(300, 300));
      const tester = new UiHitTester(h.engine, root);

      expect(tester.hitTest(25, 10)?.node).toBe(spill);
      // 100px to the right the child is still there in layout terms,
      // but clipped away, so the root's flow takes the hit.
      expect(tester.hitTest(120, 10)?.node).toBe(root);
      // The header is drawn at the list's top (y 50..60) although its
      // record sits at 50 and the content is scrolled by 30.
      expect(tester.hitTest(10, 55)?.node).toBe(header);
      expect(tester.hitTest(10, 75)?.node).toBe(body);
    });
  });
});

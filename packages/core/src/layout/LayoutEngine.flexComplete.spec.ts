import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { auto, percent } from './UiLength';

/**
 * Flex completeness: redistribution, stretch by default,
 * automatic minimum size, wrapping, reversal, auto margins, the flex
 * shorthand, percentages and aspect ratio. The Chrome fixtures pin the
 * pixels; these pin the intent, in isolation, with readable numbers.
 */
describe('LayoutEngine flex completeness', () => {
  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }
  const box = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) => node(h, id, UiNodeType.Box, props);
  const row = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) => node(h, id, UiNodeType.Row, props);
  const column = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) =>
    node(h, id, UiNodeType.Column, props);
  const text = (h: LayoutHarness, id: string, value: string, props: Record<string, unknown> = {}) =>
    node(h, id, UiNodeType.Text, { text: value, fontSize: 10, ...props });

  describe('redistribution', () => {
    it('gives space a clamped grower cannot take to the others', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 300 });
      const capped = box(h, 'capped', { height: 20, flexGrow: 1, maxWidth: 60 });
      const free = box(h, 'free', { height: 20, flexGrow: 1 });
      h.append(root, capped, free);
      h.layout(root, Constraints.unbounded());
      expect(h.box(capped).width).toBe(60);
      expect(h.box(free).width).toBe(240);
    });

    it('moves a deficit a clamped shrinker cannot absorb onto the others', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 300 });
      const rigid = box(h, 'rigid', { width: 200, height: 20, minWidth: 180 });
      const soft = box(h, 'soft', { width: 200, height: 20 });
      h.append(root, rigid, soft);
      h.layout(root, Constraints.unbounded());
      expect(h.box(rigid).width).toBe(180);
      expect(h.box(soft).width).toBe(120);
    });

    it('takes only the fraction of free space its factors sum to below one', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 200 });
      const a = box(h, 'a', { height: 20, flexGrow: 0.25 });
      const b = box(h, 'b', { height: 20, flexGrow: 0.25 });
      h.append(root, a, b);
      h.layout(root, Constraints.unbounded());
      expect(h.box(a).width).toBe(50);
      expect(h.box(b).width).toBe(50);
    });
  });

  describe('stretch by default', () => {
    it('fills the cross axis unless a child has an explicit size there', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { height: 60 });
      const tall = box(h, 'tall', { width: 40 });
      const fixed = box(h, 'fixed', { width: 40, height: 20 });
      h.append(root, tall, fixed);
      h.layout(root, Constraints.unbounded());
      expect(h.box(tall).height).toBe(60);
      expect(h.box(fixed).height).toBe(20);
    });

    it("clamps a stretched size by the child's own max", () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { width: 200 });
      const capped = box(h, 'capped', { height: 20, maxWidth: 120 });
      h.append(root, capped);
      h.layout(root, Constraints.unbounded());
      expect(h.box(capped).width).toBe(120);
    });

    it('is opted out with start on the container', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { width: 200, x: 'start' });
      const label = text(h, 'label', 'ab');
      h.append(root, label);
      h.layout(root, Constraints.unbounded());
      expect(h.box(label).width).toBe(12);
    });
  });

  describe('automatic minimum size', () => {
    it('keeps a text item at its longest word', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 60 });
      const label = text(h, 'label', 'abcdefghij kl');
      const rigid = box(h, 'rigid', { width: 30, height: 10, flexShrink: 0 });
      h.append(root, label, rigid);
      h.layout(root, Constraints.unbounded());
      expect(h.box(label).width).toBe(60);
      expect(h.box(rigid).x).toBe(60);
    });

    it('yields to an explicit minimum of zero', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 60 });
      const label = text(h, 'label', 'abcdefghij', { minWidth: 0 });
      const rigid = box(h, 'rigid', { width: 30, height: 10, flexShrink: 0 });
      h.append(root, label, rigid);
      h.layout(root, Constraints.unbounded());
      expect(h.box(label).width).toBe(30);
    });

    it('does not let a column crush items below their content height', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { height: 20 });
      const a = text(h, 'a', 'ab');
      const b = text(h, 'b', 'cd');
      h.append(root, a, b);
      h.layout(root, Constraints.unbounded());
      expect(h.box(a).height).toBe(12);
      expect(h.box(b)).toMatchObject({ y: 12, height: 12 });
    });

    it('still shrinks empty boxes with explicit sizes', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 100 });
      const a = box(h, 'a', { width: 80, height: 20 });
      const b = box(h, 'b', { width: 80, height: 20 });
      h.append(root, a, b);
      h.layout(root, Constraints.unbounded());
      expect(h.box(a).width).toBe(50);
      expect(h.box(b).width).toBe(50);
    });

    it('gives clipped text no minimum', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 60 });
      const label = text(h, 'label', 'abcdefghij', { textWrap: 'none', textOverflow: 'ellipsis' });
      h.append(root, label);
      h.layout(root, Constraints.unbounded());
      expect(h.box(label).width).toBe(60);
    });
  });

  describe('wrapping', () => {
    it('breaks items into lines and stacks them with the line gap', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 100, flexWrap: 'wrap', rowGap: 8, columnGap: 4, y: 'start' });
      const items = [1, 2, 3].map(i => box(h, `i${i}`, { width: 45, height: 20 }));
      h.append(root, ...items);
      h.layout(root, Constraints.unbounded());
      expect(h.box(items[0])).toEqual({ x: 0, y: 0, width: 45, height: 20 });
      expect(h.box(items[1])).toEqual({ x: 49, y: 0, width: 45, height: 20 });
      expect(h.box(items[2])).toEqual({ x: 0, y: 28, width: 45, height: 20 });
      expect(h.record(root).measuredHeight).toBe(48);
    });

    it('stretches lines to fill a definite cross size by default', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 100, height: 100, flexWrap: 'wrap' });
      const items = [1, 2, 3].map(i => box(h, `i${i}`, { width: 40 }));
      h.append(root, ...items);
      h.layout(root, Constraints.unbounded());
      expect(h.box(items[0]).height).toBe(50);
      expect(h.box(items[2])).toMatchObject({ y: 50, height: 50 });
    });

    it('distributes lines with alignContent', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 100, height: 100, flexWrap: 'wrap', alignContent: 'space-between' });
      const items = [1, 2, 3].map(i => box(h, `i${i}`, { width: 40, height: 20 }));
      h.append(root, ...items);
      h.layout(root, Constraints.unbounded());
      expect(h.box(items[0]).y).toBe(0);
      expect(h.box(items[2]).y).toBe(80);
    });

    it('mirrors the cross axis for wrap-reverse', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 100, height: 100, flexWrap: 'wrap-reverse', alignContent: 'start' });
      const items = [1, 2, 3].map(i => box(h, `i${i}`, { width: 40, height: 20 }));
      h.append(root, ...items);
      h.layout(root, Constraints.unbounded());
      expect(h.box(items[0]).y).toBe(80);
      expect(h.box(items[2]).y).toBe(60);
    });
  });

  describe('reversal', () => {
    it('lays a row-reverse out from the right', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 300, direction: 'row-reverse', y: 'start' });
      const a = box(h, 'a', { width: 40, height: 20 });
      const b = box(h, 'b', { width: 60, height: 20 });
      h.append(root, a, b);
      h.layout(root, Constraints.unbounded());
      expect(h.box(a).x).toBe(260);
      expect(h.box(b).x).toBe(200);
    });

    it('mirrors a row under rtl, and rtl plus row-reverse cancel out', () => {
      const h = new LayoutHarness();
      const rtl = row(h, 'rtl', { width: 300, textDirection: 'rtl', y: 'start' });
      const a = box(h, 'a', { width: 40, height: 20 });
      h.append(rtl, a);
      h.layout(rtl, Constraints.unbounded());
      expect(h.box(a).x).toBe(260);

      const both = row(h, 'both', { width: 300, textDirection: 'rtl', direction: 'row-reverse', y: 'start' });
      const b = box(h, 'b', { width: 40, height: 20 });
      h.append(both, b);
      h.layout(both, Constraints.unbounded());
      expect(h.box(b).x).toBe(0);
    });
  });

  describe('auto margins', () => {
    it('absorb free space on the main axis before alignment', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 300, x: 'center', y: 'start' });
      const a = box(h, 'a', { width: 40, height: 20 });
      const b = box(h, 'b', { width: 40, height: 20, marginLeft: auto });
      h.append(root, a, b);
      h.layout(root, Constraints.unbounded());
      expect(h.box(a).x).toBe(0);
      expect(h.box(b).x).toBe(260);
    });

    it('centre an item on the cross axis', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 300, height: 100 });
      const a = box(h, 'a', { width: 40, height: 20, marginTop: auto, marginBottom: auto });
      h.append(root, a);
      h.layout(root, Constraints.unbounded());
      expect(h.box(a).y).toBe(40);
    });
  });

  describe('flex shorthand, percentages, aspect ratio', () => {
    it('shares space equally with flex: 1 regardless of content', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { width: 300, y: 'start' });
      const a = box(h, 'a', { height: 20, flex: 1 });
      const b = box(h, 'b', { width: 200, height: 20, flex: 1 });
      h.append(root, a, b);
      h.layout(root, Constraints.unbounded());
      expect(h.box(a).width).toBe(150);
      expect(h.box(b).width).toBe(150);
    });

    it('resolves percentages against the parent content box', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { width: 200, padding: 20, x: 'start' });
      const half = box(h, 'half', { width: percent(50), height: 20 });
      h.append(root, half);
      h.layout(root, Constraints.unbounded());
      expect(h.box(half).width).toBe(80);
    });

    it('treats a percentage of an indefinite size as auto', () => {
      const h = new LayoutHarness();
      const root = row(h, 'top', { y: 'start' });
      const item = box(h, 'item', { width: percent(50), height: 20 });
      h.append(root, item);
      h.layout(root, Constraints.unbounded());
      expect(h.box(item).width).toBe(0);
    });

    it('throws on a string length, naming the property', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top');
      const bad = box(h, 'bad', { width: '100%', height: 20 });
      h.append(root, bad);
      expect(() => h.layout(root, Constraints.unbounded())).toThrow(/'width'/);
    });

    it('derives the undecided axis from aspectRatio', () => {
      const h = new LayoutHarness();
      const root = column(h, 'top', { width: 200 });
      const wide = box(h, 'wide', { width: 100, aspectRatio: 2 });
      const stretched = box(h, 'stretched', { aspectRatio: 4 });
      h.append(root, wide, stretched);
      h.layout(root, Constraints.unbounded());
      expect(h.box(wide)).toMatchObject({ width: 100, height: 50 });
      expect(h.box(stretched)).toMatchObject({ width: 200, height: 50 });
    });
  });
});

import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import { UiNodeType } from '../graph/UiNodeType';
import { UiFrame } from '../scheduler/UiFrame';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { percent } from './UiLength';

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
      // A start-aligned 50-wide stack hands the column a loose 50.
      const slot = harness.createNode('slot', UiNodeType.Box);
      slot.setProperty('width', 50);
      slot.setProperty('x', 'start');
      harness.append(slot, column);
      harness.layout(slot, new Constraints(0, 300, 0, Infinity));
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

  describe('resolved properties', () => {
    it("re-resolves a node's percentages when its container's content box becomes known", () => {
      // Row 800 > [Box 40, Column { flexGrow: 1 } > Box { position:
      // relative, left: 20% }]. The inner box is resolved twice in the
      // one pass: once while the grown column's width is still being
      // decided, where the percentage has no base and the offset is
      // nothing, and again once the column is 736 wide, where it is
      // 147.2 and shifts the box.
      //
      // The engine memoizes a node's resolved properties for the length
      // of a pass, and this is the case that says the percentage base
      // has to be part of what the memo is keyed on. Keyed on the pass
      // alone, the second resolution is skipped and the box stays at
      // its flow position.
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('width', 800);
      row.setProperty('height', 56);
      row.setProperty('padding', 8);
      row.setProperty('gap', 8);
      const artwork = harness.createNode('artwork', UiNodeType.Box);
      artwork.setProperty('width', 40);
      artwork.setProperty('height', 40);
      const lines = harness.createNode('lines', UiNodeType.Column);
      lines.setProperty('flexGrow', 1);
      const target = harness.createNode('target', UiNodeType.Box);
      target.setProperty('position', 'relative');
      target.setProperty('left', percent(20));
      target.setProperty('width', 6);
      target.setProperty('height', 6);
      harness.append(lines, target);
      harness.append(row, artwork, lines);
      harness.layout(row, Constraints.tight(800, 56));

      expect(harness.record(lines).width).toBe(736);
      expect(harness.record(target).left).toBe(147.2);
      expect(harness.boxOf(target).x).toBe(203.2);
    });
  });

  describe('a size it has been laid out at before', () => {
    /**
     * An application shell's shape: a full-height page, a split pane
     * whose first pane is a percentage of the width and the full
     * height, and a column inside it with a footer pinned to its
     * bottom. The window is resized and resized back, so every node is
     * asked questions it has answered before.
     */
    function shell() {
      const harness = new LayoutHarness();
      const node = (id: string, type: UiNodeType, props: Record<string, unknown> = {}) => {
        const created = harness.createNode(id, type);
        for (const [name, value] of Object.entries(props)) {
          created.setProperty(name, value);
        }
        return created;
      };
      const root = node('app', UiNodeType.Box, { x: 'stretch', y: 'stretch' });
      const page = node('page', UiNodeType.Column, { width: percent(100), height: percent(100) });
      const row = node('row', UiNodeType.Row, { width: percent(100), height: percent(100), y: 'stretch' });
      const split = node('split', UiNodeType.Row, { width: percent(100), height: percent(100), flexGrow: 1 });
      const pane = node('pane', UiNodeType.Box, {
        width: percent(20),
        height: percent(100),
        minWidth: 0,
        minHeight: 0,
        flexShrink: 0,
        overflow: 'hidden'
      });
      const column = node('column', UiNodeType.Column, { height: percent(100) });
      const footer = node('footer', UiNodeType.Box, { height: 40 });
      harness.append(column, node('list', UiNodeType.Box, { flexGrow: 1 }), footer);
      harness.append(pane, column);
      harness.append(split, pane, node('main', UiNodeType.Box, { flexGrow: 1, flexBasis: 0 }));
      harness.append(row, split);
      harness.append(page, row);
      harness.append(root, page);
      const resize = (height: number) =>
        harness.engine.layoutForFrame(
          new UiFrame(1, 0, new Map([[root, DirtyFlags.Layout]])),
          Constraints.tight(1280, height)
        );
      harness.layout(root, Constraints.tight(1280, 988));
      return { harness, column, footer, resize };
    }

    it('lays out a taller window at the taller size', () => {
      // A percentage resolves against the container's content box,
      // which is not in the constraints. The pane was asked the same
      // loose height under both windows, and handing back the height
      // it had in the shorter one left the footer 312 pixels short.
      const { harness, column, footer, resize } = shell();
      resize(1300);
      expect(harness.boxOf(column).height).toBe(1300);
      expect(harness.boxOf(footer).y).toBe(1260);
    });

    it('lays out a window resized back at the size it came from', () => {
      // The pane remembers its answer for this window from before, and
      // a memo hit leaves its children holding their answers to the
      // last question they were asked, which was the taller window's.
      // A stack placed each one at that size.
      const { harness, column, footer, resize } = shell();
      resize(1300);
      resize(988);
      expect(harness.boxOf(column).height).toBe(988);
      expect(harness.boxOf(footer).y).toBe(948);
    });
  });
});

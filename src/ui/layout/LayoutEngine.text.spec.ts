import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

/**
 * Text as a layout citizen: wrapping decides heights, flex measures
 * twice so it sees them, and baselines line up.
 *
 * The deterministic measurer makes a 10px glyph 6px wide, a line
 * 12px tall and the first baseline 9px below the line top.
 */
describe('LayoutEngine text', () => {
  function text(harness: LayoutHarness, id: string, value: string, props: Record<string, unknown> = {}): UiNode {
    const node = harness.createNode(id, UiNodeType.Text);
    node.setProperty('text', value);
    node.setProperty('fontSize', 10);
    for (const [name, prop] of Object.entries(props)) {
      node.setProperty(name, prop);
    }
    return node;
  }

  function leaf(
    harness: LayoutHarness,
    id: string,
    width: number,
    height: number,
    props: Record<string, unknown> = {}
  ) {
    const node = harness.createNode(id, UiNodeType.Box);
    node.setProperty('width', width);
    node.setProperty('height', height);
    for (const [name, prop] of Object.entries(props)) {
      node.setProperty(name, prop);
    }
    return node;
  }

  describe('wrapping in a column', () => {
    it('wraps at the column width and grows in height', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('width', 60);
      const paragraph = text(harness, 'p', 'abcd efgh ijkl');
      harness.append(column, paragraph);
      harness.layout(column, Constraints.unbounded());
      // 'abcd efgh' is 54 wide and fits; 'ijkl' goes to line two. Once
      // wrapping happened the paragraph is fit-content: the available 60.
      expect(harness.box(paragraph)).toEqual({ x: 0, y: 0, width: 60, height: 24 });
    });

    it('is fit-content wide, never narrower than its widest word', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('width', 30);
      const paragraph = text(harness, 'p', 'abcdefgh ij');
      harness.append(column, paragraph);
      harness.layout(column, Constraints.unbounded());
      expect(harness.box(paragraph)).toEqual({ x: 0, y: 0, width: 48, height: 24 });
    });

    it('wraps a stretched child at the full column width', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('width', 60);
      column.setProperty('x', 'stretch');
      const paragraph = text(harness, 'p', 'ab cd ef gh ij');
      harness.append(column, paragraph);
      harness.layout(column, Constraints.unbounded());
      // 'ab cd ef gh' is 66 wide; three words (48) fit in 60.
      expect(harness.box(paragraph)).toEqual({ x: 0, y: 0, width: 60, height: 24 });
      expect(harness.record(column).measuredHeight).toBe(24);
    });

    it('honours textWrap none, maxLines and the resulting height', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('width', 30);
      const nowrap = text(harness, 'nowrap', 'ab cd ef', { textWrap: 'none' });
      const clamped = text(harness, 'clamped', 'ab cd ef gh', { maxLines: 2, textOverflow: 'ellipsis' });
      harness.append(column, nowrap, clamped);
      harness.layout(column, Constraints.unbounded());
      expect(harness.box(nowrap)).toEqual({ x: 0, y: 0, width: 48, height: 12 });
      expect(harness.box(clamped)).toEqual({ x: 0, y: 12, width: 30, height: 24 });
    });
  });

  describe('two-pass flex in a row', () => {
    it('measures text at max-content for its flex base, then re-wraps at its final width', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('width', 100);
      const paragraph = text(harness, 'p', 'abcd efgh ijkl');
      const fixed = leaf(harness, 'fixed', 40, 10, { flexShrink: 0 });
      harness.append(row, paragraph, fixed);
      harness.layout(row, Constraints.unbounded());
      // Base 84 + 40 overflows 100; the text shrinks to 60, where
      // 'abcd efgh' (54) fits and 'ijkl' wraps, and the row's height
      // follows the two lines.
      expect(harness.box(paragraph)).toEqual({ x: 0, y: 0, width: 60, height: 24 });
      expect(harness.box(fixed)).toEqual({ x: 60, y: 0, width: 40, height: 10 });
      expect(harness.record(row).measuredHeight).toBe(24);
    });

    it('weights shrink by max-content width, as CSS does', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('width', 70);
      const a = text(harness, 'a', 'abcd efgh'); // 54
      const b = text(harness, 'b', 'ab cd'); // 30
      harness.append(row, a, b);
      harness.layout(row, Constraints.unbounded());
      // Deficit 14 split 54:30 → a shrinks 9, b shrinks 5.
      expect(harness.box(a).width).toBeCloseTo(45, 5);
      expect(harness.box(b).width).toBeCloseTo(25, 5);
      expect(harness.box(a).height).toBe(24);
      expect(harness.box(b).height).toBe(24);
    });

    it('lets an unshrinkable item overflow rather than clamping it', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('width', 50);
      const wide = leaf(harness, 'wide', 120, 10, { flexShrink: 0 });
      harness.append(row, wide);
      harness.layout(row, Constraints.unbounded());
      expect(harness.box(wide).width).toBe(120);
    });

    it('re-measures a grown column so its wrapped text uses the new width', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('width', 120);
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('flexGrow', 1);
      column.setProperty('x', 'stretch');
      const paragraph = text(harness, 'p', 'ab cd ef gh ij kl');
      harness.append(column, paragraph);
      harness.append(row, column);
      harness.layout(row, Constraints.unbounded());
      // 'ab cd ef gh ij kl' is 102 wide and fits the grown 120 column
      // on one line; measured at max-content it would have too.
      expect(harness.box(column)).toEqual({ x: 0, y: 0, width: 120, height: 12 });
      expect(harness.box(paragraph)).toEqual({ x: 0, y: 0, width: 120, height: 12 });
    });
  });

  describe('baseline alignment', () => {
    it('aligns first baselines of different font sizes', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('y', 'baseline');
      const small = text(harness, 'small', 'ab');
      const large = text(harness, 'large', 'cd');
      large.setProperty('fontSize', 20);
      harness.append(row, small, large);
      harness.layout(row, Constraints.unbounded());
      // Baselines: small 9, large 18 → small sits 9px lower.
      expect(harness.box(small)).toEqual({ x: 0, y: 9, width: 12, height: 12 });
      expect(harness.box(large)).toEqual({ x: 12, y: 0, width: 24, height: 24 });
      expect(harness.record(row).measuredHeight).toBe(24);
    });

    it('includes padding and margin in an item baseline', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('y', 'baseline');
      const padded = text(harness, 'padded', 'ab', { paddingTop: 10 });
      const margined = text(harness, 'margined', 'cd', { marginTop: 4 });
      harness.append(row, padded, margined);
      harness.layout(row, Constraints.unbounded());
      // padded baseline 19 from its top; margined 13 from its margin top.
      expect(harness.box(padded).y).toBe(0);
      expect(harness.box(margined).y).toBe(10);
      expect(harness.record(row).measuredHeight).toBe(22);
    });

    it('synthesises a baseline from the bottom of a box without text', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('y', 'baseline');
      const box = leaf(harness, 'box', 20, 30);
      const label = text(harness, 'label', 'ab');
      harness.append(row, box, label);
      harness.layout(row, Constraints.unbounded());
      expect(harness.box(box).y).toBe(0);
      expect(harness.box(label).y).toBe(21);
    });

    it('takes a container baseline from its first child', () => {
      const harness = new LayoutHarness();
      const row = harness.createNode('row', UiNodeType.Row);
      row.setProperty('y', 'baseline');
      const column = harness.createNode('column', UiNodeType.Column);
      const big = text(harness, 'big', 'ab');
      big.setProperty('fontSize', 20);
      const small = text(harness, 'small', 'cd');
      harness.append(column, big, small);
      const label = text(harness, 'label', 'ef');
      harness.append(row, column, label);
      harness.layout(row, Constraints.unbounded());
      expect(harness.box(column).y).toBe(0);
      expect(harness.box(label).y).toBe(9);
    });

    it('treats baseline as start in a column', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('x', 'baseline');
      const label = text(harness, 'label', 'ab');
      harness.append(column, label);
      harness.layout(column, Constraints.loose(100, 100));
      expect(harness.box(label).x).toBe(0);
    });
  });

  describe('leaves include their padding', () => {
    it('sizes a button as its text plus padding', () => {
      const harness = new LayoutHarness();
      const button = harness.createNode('button', UiNodeType.Button);
      button.setProperty('text', 'Save');
      button.setProperty('fontSize', 10);
      button.setProperty('padding', 8);
      harness.layout(button);
      expect(harness.record(button).measuredWidth).toBe(24 + 16);
      expect(harness.record(button).measuredHeight).toBe(12 + 16);
      expect(harness.record(button).baseline).toBe(8 + 9);
    });

    it('sizes an empty box as its padding', () => {
      const harness = new LayoutHarness();
      const box = harness.createNode('box', UiNodeType.Box);
      box.setProperty('padding', 6);
      harness.layout(box);
      expect(harness.record(box).measuredWidth).toBe(12);
      expect(harness.record(box).measuredHeight).toBe(12);
    });

    it('wraps text inside its padding', () => {
      const harness = new LayoutHarness();
      const column = harness.createNode('column', UiNodeType.Column);
      column.setProperty('width', 64);
      const padded = text(harness, 'padded', 'abcd efgh ijkl', { padding: 5 });
      harness.append(column, padded);
      harness.layout(column, Constraints.unbounded());
      // 54 available inside the padding: 'abcd efgh' fits, 'ijkl' wraps.
      expect(harness.box(padded)).toEqual({ x: 0, y: 0, width: 64, height: 34 });
    });
  });

  it('records intrinsic widths on the text record', () => {
    const harness = new LayoutHarness();
    const paragraph = text(harness, 'p', 'ab cdef g');
    harness.layout(paragraph, Constraints.loose(30, 100));
    expect(harness.record(paragraph).maxContentWidth).toBe(54);
    expect(harness.record(paragraph).minContentWidth).toBe(24);
  });
});

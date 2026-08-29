import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { auto, fr, minmax, percent, repeat } from './UiLength';

/**
 * Grid (roadmap L6): tracks of px / percent / auto / fr / minmax, gaps,
 * auto-flow and explicit placement with spans, item alignment in cells
 * and track distribution, driven through real nodes.
 */
describe('LayoutEngine grid', () => {
  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }
  /**
   * The layout root fills the viewport, which would make every grid
   * definite on both axes; a start-aligned column around it lets the
   * grid size itself like a grid in a page would.
   */
  const grid = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) => {
    const wrapper = node(h, `${id}-wrapper`, UiNodeType.Column, { x: 'start', y: 'start' });
    const created = node(h, id, UiNodeType.Grid, props);
    h.append(wrapper, created);
    return created;
  };
  const layout = (h: LayoutHarness, g: UiNode, constraints = Constraints.loose(400, 400)) =>
    h.layout(g.parent as UiNode, constraints);
  const box = (h: LayoutHarness, id: string, props: Record<string, unknown> = {}) => node(h, id, UiNodeType.Box, props);
  const text = (h: LayoutHarness, id: string, value: string, props: Record<string, unknown> = {}) =>
    node(h, id, UiNodeType.Text, { text: value, fontSize: 10, lineHeight: 10, ...props });

  it('lays a settings page out as label auto, control 1fr', () => {
    const h = new LayoutHarness(new CharacterCountTextMeasurer({ glyphWidth: 1 }));
    const root = grid(h, 'top', { width: 300, columns: [auto, fr(1)], gap: 8 });
    const l1 = text(h, 'l1', 'Name');
    const c1 = box(h, 'c1', { height: 24 });
    const l2 = text(h, 'l2', 'Email address');
    const c2 = box(h, 'c2', { height: 24 });
    h.append(root, l1, c1, l2, c2);
    layout(h, root);

    // The label column takes the widest label (13 glyphs at 10px = 130);
    // labels stretch to their row like any grid item.
    expect(h.box(l1)).toEqual({ x: 0, y: 0, width: 130, height: 24 });
    expect(h.box(c1)).toEqual({ x: 138, y: 0, width: 162, height: 24 });
    // Second row starts after the first row (24) plus the gap.
    expect(h.box(l2)).toEqual({ x: 0, y: 32, width: 130, height: 24 });
    expect(h.box(c2)).toEqual({ x: 138, y: 32, width: 162, height: 24 });
    expect(h.box(root).height).toBe(56);
  });

  it('places by explicit line and span, flowing the rest around', () => {
    const h = new LayoutHarness();
    const root = grid(h, 'top', { columns: repeat(3, 50), rows: [20, 20] });
    const wide = box(h, 'wide', { column: 1, row: 1, columnSpan: 2 });
    const a = box(h, 'a');
    const b = box(h, 'b');
    const c = box(h, 'c');
    h.append(root, wide, a, b, c);
    layout(h, root);
    expect(h.box(wide)).toEqual({ x: 0, y: 0, width: 100, height: 20 });
    expect(h.box(a)).toEqual({ x: 100, y: 0, width: 50, height: 20 });
    expect(h.box(b)).toEqual({ x: 0, y: 20, width: 50, height: 20 });
    expect(h.box(c)).toEqual({ x: 50, y: 20, width: 50, height: 20 });
    expect(h.box(root)).toEqual({ x: 0, y: 0, width: 150, height: 40 });
  });

  it('grows implicit rows at autoRows and fills columns in column flow', () => {
    const h = new LayoutHarness();
    const root = grid(h, 'top', { rows: [10, 10], autoColumns: 30, autoFlow: 'column' });
    const items = [0, 1, 2].map(i => box(h, `i${i}`));
    h.append(root, ...items);
    layout(h, root);
    expect(h.box(items[0])).toEqual({ x: 0, y: 0, width: 30, height: 10 });
    expect(h.box(items[1])).toEqual({ x: 0, y: 10, width: 30, height: 10 });
    expect(h.box(items[2])).toEqual({ x: 30, y: 0, width: 30, height: 10 });
  });

  it('shares definite width among fr and minmax tracks and resolves percentages', () => {
    const h = new LayoutHarness();
    const root = grid(h, 'top', { width: 400, height: 50, columns: [percent(25), minmax(50, 80), fr(1), fr(3)] });
    const items = [0, 1, 2, 3].map(i => box(h, `i${i}`));
    h.append(root, ...items);
    layout(h, root);
    // Maximising runs before fr: minmax grows to 80, then 220 is split 1:3.
    expect(items.map(i => h.box(i).width)).toEqual([100, 80, 55, 165]);
    expect(h.box(items[0]).height).toBe(50);
  });

  it('aligns items in their cells and distributes tracks', () => {
    const h = new LayoutHarness();
    const root = grid(h, 'top', {
      width: 200,
      height: 100,
      columns: [50, 50],
      rows: [40],
      justifyContent: 'space-between',
      alignContent: 'end',
      x: 'center',
      y: 'end'
    });
    const a = box(h, 'a', { width: 20, height: 10 });
    const b = box(h, 'b', { width: 20, height: 10, selfX: 'start', selfY: 'start' });
    h.append(root, a, b);
    layout(h, root);
    // Columns at 0 and 150; the single row sits at 60.
    expect(h.box(a)).toEqual({ x: 15, y: 90, width: 20, height: 10 });
    expect(h.box(b)).toEqual({ x: 150, y: 60, width: 20, height: 10 });
  });

  it('stretches items by default and honours margins in the cell', () => {
    const h = new LayoutHarness();
    const root = grid(h, 'top', { columns: [100], rows: [50], padding: 5 });
    const a = box(h, 'a', { margin: 4 });
    h.append(root, a);
    layout(h, root);
    expect(h.box(a)).toEqual({ x: 9, y: 9, width: 92, height: 42 });
    expect(h.box(root)).toEqual({ x: 0, y: 0, width: 110, height: 60 });
  });

  it('wraps text at its column and lets the row grow to fit', () => {
    const h = new LayoutHarness(new CharacterCountTextMeasurer({ glyphWidth: 1 }));
    const root = grid(h, 'top', { columns: [60, 60] });
    const t = text(h, 't', 'aaaa bbbb cccc dddd');
    const b = box(h, 'b');
    h.append(root, t, b);
    layout(h, root);
    // 'aaaa bbbb' is 90 glyph-px, wider than 60: one word per line.
    expect(h.box(t)).toEqual({ x: 0, y: 0, width: 60, height: 40 });
    expect(h.box(b)).toEqual({ x: 60, y: 0, width: 60, height: 40 });
  });

  it('shares header and body track sizes when both are columns of one grid', () => {
    const h = new LayoutHarness(new CharacterCountTextMeasurer({ glyphWidth: 1 }));
    const root = grid(h, 'top', { width: 300, columns: [auto, fr(1), auto] });
    const header = ['Id', 'Name', 'Status'].map((s, i) => text(h, `h${i}`, s));
    const row = ['1234', 'A', 'ok'].map((s, i) => text(h, `r${i}`, s));
    h.append(root, ...header, ...row);
    layout(h, root);
    // Column 0 is the widest of 'Id' / '1234'; column 2 of 'Status' / 'ok'.
    expect(h.box(header[0]).width).toBe(40);
    expect(h.box(row[0]).width).toBe(40);
    expect(h.box(header[2]).width).toBe(60);
    expect(h.box(row[1])).toMatchObject({ x: 40, width: 200 });
  });

  it('reports the grid min-content width as the sum of track minimums', () => {
    const h = new LayoutHarness(new CharacterCountTextMeasurer({ glyphWidth: 1 }));
    const outer = node(h, 'outer', UiNodeType.Row, { width: 100, x: 'start' });
    const g = node(h, 'g', UiNodeType.Grid, { columns: [auto, auto], gap: 10 });
    h.append(g, text(h, 'a', 'aaaa bbbb'), box(h, 'b', { width: 30 }));
    h.append(outer, g);
    h.layout(outer, Constraints.loose(400, 400));
    // min-content: 'bbbb' 40 + gap 10 + 30 = 80.
    expect(h.record(g).minContentWidth).toBe(80);
  });

  it('rejects a track list that is not an array', () => {
    const h = new LayoutHarness();
    const root = grid(h, 'top', { columns: '1fr 1fr' });
    h.append(root, box(h, 'a'));
    expect(() => layout(h, root)).toThrow(/columns/);
  });
});

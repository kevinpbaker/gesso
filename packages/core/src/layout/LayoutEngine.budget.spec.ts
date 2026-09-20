import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { DirtyFlags } from '../graph/DirtyFlags';
import { UiFrame } from '../scheduler/UiFrame';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

/**
 * Layout budgets. A synthetic application tree — a page
 * column, a scroller, hundreds of fixed-height rows each holding a few
 * columns of text — is laid out once in full and then edited in the
 * small ways applications edit it. The counts are hard budgets: they
 * fail the build with numbers when a change makes layout do more work
 * than the change warrants. The timings are ceilings generous enough
 * for a loaded CI machine and only catch regressions of an order of
 * magnitude; the numbers are printed so a trend is visible.
 */
describe('LayoutEngine budgets', () => {
  const ROWS = 500;
  const COLUMNS_PER_ROW = 5;
  const TEXTS_PER_COLUMN = 3;
  const NODE_COUNT = 2 + ROWS * (1 + COLUMNS_PER_ROW * (1 + TEXTS_PER_COLUMN));
  const VIEWPORT = Constraints.loose(1200, 800);

  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  function buildTree(h: LayoutHarness) {
    const root = node(h, 'top', UiNodeType.Column);
    const list = node(h, 'list', UiNodeType.ScrollView, { flex: 1 });
    const texts: UiNode[] = [];
    for (let r = 0; r < ROWS; r++) {
      const row = node(h, `row${r}`, UiNodeType.Row, { height: 40, gap: 8, padding: 4 });
      for (let c = 0; c < COLUMNS_PER_ROW; c++) {
        const column = node(h, `row${r}c${c}`, UiNodeType.Column, { flex: 1, minWidth: 0 });
        for (let t = 0; t < TEXTS_PER_COLUMN; t++) {
          const text = node(h, `row${r}c${c}t${t}`, UiNodeType.Text, {
            text: `Row ${r} column ${c} line ${t}`,
            fontSize: 10
          });
          texts.push(text);
          h.append(column, text);
        }
        h.append(row, column);
      }
      h.append(list, row);
    }
    h.append(root, list);
    return { root, list, texts };
  }

  function frame(h: LayoutHarness, dirty: [UiNode, DirtyFlags][]): void {
    h.engine.layoutForFrame(new UiFrame(1, 0, new Map(dirty)), VIEWPORT);
  }

  function timed<T>(label: string, run: () => T): { result: T; ms: number } {
    const start = performance.now();
    const result = run();
    const ms = performance.now() - start;
    // eslint-disable-next-line no-console
    console.info(`[layout budget] ${label}: ${ms.toFixed(2)} ms`);
    return { result, ms };
  }

  it('lays out the whole tree once, within budget', () => {
    const h = new LayoutHarness();
    const { root } = buildTree(h);
    const { ms } = timed(`full layout of ${NODE_COUNT} nodes`, () => h.layout(root, VIEWPORT));
    expect(h.engine.stats.measured).toBeGreaterThanOrEqual(NODE_COUNT);
    expect(h.engine.stats.fullLayout).toBe(true);
    // Fixed-height rows in the scroller are boundaries: a change inside
    // one stays inside it.
    expect(h.record(root.firstChild!.firstChild!).relayoutBoundary).toBe(true);
    expect(ms).toBeLessThan(2000);
  });

  it('re-measures fewer than 20 nodes for a text change deep in the tree', () => {
    const h = new LayoutHarness();
    const { root, texts } = buildTree(h);
    h.layout(root, VIEWPORT);
    const target = texts[Math.floor(texts.length / 2)];
    const before = h.box(target.parent!.parent!);
    target.setProperty('text', 'Changed to something considerably longer than before');
    const { ms } = timed('text change deep in the tree', () => frame(h, [[target, DirtyFlags.Layout]]));
    const { measured, placed, relayoutRoots, fullLayout } = h.engine.stats;
    // eslint-disable-next-line no-console
    console.info(`[layout budget] text change: measured ${measured}, placed ${placed}, roots ${relayoutRoots}`);
    expect(fullLayout).toBe(false);
    expect(measured).toBeLessThan(20);
    expect(placed).toBeLessThan(20);
    expect(relayoutRoots).toBe(1);
    // The row kept its box; the text inside it was laid out again.
    expect(h.box(target.parent!.parent!)).toEqual(before);
    expect(h.record(target).measureDirty).toBe(false);
    expect(ms).toBeLessThan(50);
  });

  it('re-measures nothing for a scroll-only frame', () => {
    const h = new LayoutHarness();
    const { root, list } = buildTree(h);
    h.layout(root, VIEWPORT);
    list.setProperty('scrollY', 1000);
    const { ms } = timed('scroll-only frame', () => frame(h, [[list, DirtyFlags.Transform]]));
    expect(h.engine.stats.measured).toBe(0);
    expect(h.engine.stats.placed).toBe(0);
    expect(h.record(list).scrollY).toBe(1000);
    expect(ms).toBeLessThan(20);
  });

  it('lays out a row that gains a child from the row, not the root', () => {
    const h = new LayoutHarness();
    const { root } = buildTree(h);
    h.layout(root, VIEWPORT);
    const row = root.firstChild!.firstChild!;
    const extra = node(h, 'extra', UiNodeType.Box, { width: 20, height: 20 });
    h.append(row, extra);
    h.engine.trace = true;
    frame(h, [[row, DirtyFlags.Children]]);
    const { measured, measuredNodes, fullLayout } = h.engine.stats;
    // eslint-disable-next-line no-console
    console.info(`[layout budget] row gains a child: measured ${measured}`);
    expect(fullLayout).toBe(false);
    // Every column and text in the row is laid out at the row's new
    // distribution — once loose and once at its final size — and
    // nothing outside the row is touched.
    expect(measured).toBeLessThan(50);
    for (const n of measuredNodes) {
      let inRow = n === row;
      for (let p = n.parent; p !== null && !inRow; p = p.parent) {
        inRow = p === row;
      }
      expect(inRow, `${n.id} is outside the row`).toBe(true);
    }
    expect(h.box(extra).width).toBe(20);
  });

  it('never gives a fragment a layout record, even when the dirty walk starts at one', () => {
    // Component anchors are fragments; a component re-render dirties its
    // anchor. Renderers treat any record as a box to cull against, so a
    // fragment with an empty record would take its whole subtree off
    // screen — which is exactly what happened once.
    const h = new LayoutHarness();
    const root = node(h, 'top', UiNodeType.Column);
    const anchor = node(h, 'anchor', UiNodeType.Fragment);
    const leaf = node(h, 'leaf', UiNodeType.Box, { width: 30, height: 30 });
    h.append(anchor, leaf);
    h.append(root, anchor);
    h.layout(root, VIEWPORT);
    expect(h.engine.recordFor(anchor)).toBeUndefined();

    h.append(anchor, node(h, 'leaf2', UiNodeType.Box, { width: 30, height: 30 }));
    frame(h, [[anchor, DirtyFlags.Children]]);
    expect(h.engine.recordFor(anchor)).toBeUndefined();
    expect(h.box(leaf)).toEqual({ x: 0, y: 0, width: 30, height: 30 });
  });

  it('lays out an inner boundary when an outer one is dirty in the same frame', () => {
    // The two dirty walks stop at different boundaries, one inside the
    // other, and the nodes between them stay clean. The outer pass
    // memo-hits that path, so the inner root must still get its own
    // pass — otherwise a lazy list's freshly mounted rows would never
    // be laid out while a heartbeat elsewhere in the page keeps ticking.
    const h = new LayoutHarness();
    const root = node(h, 'top', UiNodeType.Column);
    const page = node(h, 'page', UiNodeType.ScrollView, { flex: 1 });
    const heartbeat = node(h, 'heartbeat', UiNodeType.Text, { text: 'tick 1', fontSize: 10 });
    const section = node(h, 'section', UiNodeType.Column, { gap: 8 });
    const list = node(h, 'list', UiNodeType.ScrollView, { width: 300, height: 100 });
    h.append(section, list);
    h.append(page, heartbeat, section);
    h.append(root, page);
    h.layout(root, VIEWPORT);
    expect(h.record(page).relayoutBoundary).toBe(true);
    expect(h.record(list).relayoutBoundary).toBe(true);

    heartbeat.setProperty('text', 'tick 2');
    const row = node(h, 'row', UiNodeType.Row, { height: 24 });
    h.append(list, row);
    frame(h, [
      [heartbeat, DirtyFlags.Layout],
      [list, DirtyFlags.Children]
    ]);
    expect(h.engine.stats.fullLayout).toBe(false);
    expect(h.engine.stats.relayoutRoots).toBe(2);
    expect(h.box(row)).toEqual({ x: 0, y: h.box(list).y, width: 300, height: 24 });
  });

  it('gives the same result as a full layout', () => {
    const h = new LayoutHarness();
    const { root, texts } = buildTree(h);
    h.layout(root, VIEWPORT);
    const target = texts[7];
    target.setProperty('text', 'A much longer text than the row was laid out with, which must wrap');
    frame(h, [[target, DirtyFlags.Layout]]);
    const incremental = texts.slice(0, 40).map(t => h.box(t));

    const fresh = new LayoutHarness();
    const built = buildTree(fresh);
    built.texts[7].setProperty('text', 'A much longer text than the row was laid out with, which must wrap');
    fresh.layout(built.root, VIEWPORT);
    const full = built.texts.slice(0, 40).map(t => fresh.box(t));
    expect(incremental).toEqual(full);
  });
});

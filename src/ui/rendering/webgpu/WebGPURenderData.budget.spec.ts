import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import { Constraints } from '../../layout/LayoutTypes';
import { RenderHarness } from '../RenderTestUtils';
import { buildRenderList, CommandKind } from './WebGPURenderData';

/**
 * Render-list budgets (WebGPU roadmap G7).
 *
 * The render-list builder is the one WebGPU stage vitest can reach, so
 * it is the one CI pins. The tree is the L7 layout budget's: a page, a
 * scroller, 500 fixed-height rows of five text columns — 10,502 nodes
 * of which a 1200×800 viewport shows about twenty rows. The counts are
 * hard budgets: instances and text runs must follow the visible window,
 * not the tree, at every scroll offset. Timings are printed and capped
 * an order of magnitude above their measured value.
 */
describe('buildRenderList budgets', () => {
  const ROWS = 500;
  const COLUMNS_PER_ROW = 5;
  const TEXTS_PER_COLUMN = 3;
  const VIEWPORT = Constraints.loose(1200, 800);
  const ROW_HEIGHT = 40;
  const VISIBLE_ROWS = Math.ceil(800 / ROW_HEIGHT) + 1;

  function node(h: RenderHarness, id: string, type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  function buildTree(h: RenderHarness) {
    const root = node(h, 'top', UiNodeType.Column);
    const list = node(h, 'list', UiNodeType.ScrollView, { flex: 1 });
    for (let r = 0; r < ROWS; r++) {
      const row = node(h, `row${r}`, UiNodeType.Row, {
        height: ROW_HEIGHT,
        gap: 8,
        padding: 4,
        backgroundColor: r % 2 ? '#fff' : '#f4f4f4',
        flexShrink: 0
      });
      for (let c = 0; c < COLUMNS_PER_ROW; c++) {
        const column = node(h, `row${r}c${c}`, UiNodeType.Column, { flex: 1, minWidth: 0 });
        for (let t = 0; t < TEXTS_PER_COLUMN; t++) {
          h.append(
            column,
            node(h, `row${r}c${c}t${t}`, UiNodeType.Text, { text: `Row ${r} column ${c} line ${t}`, fontSize: 10 })
          );
        }
        h.append(row, column);
      }
      h.append(list, row);
    }
    h.append(root, list);
    return { root, list };
  }

  function timed<T>(label: string, run: () => T): { result: T; ms: number } {
    const start = performance.now();
    const result = run();
    const ms = performance.now() - start;
    // eslint-disable-next-line no-console
    console.info(`[render-list budget] ${label}: ${ms.toFixed(2)} ms`);
    return { result, ms };
  }

  it('emits instances and text runs for the visible window only, at any scroll offset', () => {
    const h = new RenderHarness(1200, 800);
    const { root, list } = buildTree(h);
    h.layout(root, VIEWPORT);
    const maxScroll = ROWS * ROW_HEIGHT - 800;

    for (const scrollY of [0, maxScroll / 2, maxScroll]) {
      list.setProperty('scrollY', scrollY);
      h.layout(root, VIEWPORT);
      const { result, ms } = timed(`build at scrollY ${scrollY}`, () =>
        buildRenderList(root, h.engine, h.measurer, 1200, 800, 1, Number.MAX_SAFE_INTEGER)
      );
      const texts = result.commands.filter(c => c.kind === CommandKind.Text).length;
      // One fill per visible row, plus the rows' text runs.
      expect(result.instanceCount, `instances at ${scrollY}`).toBeLessThanOrEqual(VISIBLE_ROWS);
      expect(result.instanceCount, `instances at ${scrollY}`).toBeGreaterThanOrEqual(VISIBLE_ROWS - 2);
      expect(texts, `text runs at ${scrollY}`).toBeLessThanOrEqual(VISIBLE_ROWS * COLUMNS_PER_ROW * TEXTS_PER_COLUMN);
      expect(texts, `text runs at ${scrollY}`).toBeGreaterThan(0);
      // Measured around 3 ms; an order of magnitude of headroom.
      expect(ms, `build time at ${scrollY}`).toBeLessThan(40);
    }
  });

  it('keeps every text run under the scroller its row belongs to', () => {
    const h = new RenderHarness(1200, 800);
    const { root, list } = buildTree(h);
    list.setProperty('scrollY', 4000);
    h.layout(root, VIEWPORT);
    const result = buildRenderList(root, h.engine, h.measurer, 1200, 800, 1, Number.MAX_SAFE_INTEGER);
    for (const command of result.commands) {
      if (command.kind === CommandKind.Text) {
        expect(command.scissor).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
      }
    }
  });
});

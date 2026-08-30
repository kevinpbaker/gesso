import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import { Constraints } from '../../layout/LayoutTypes';
import { RenderHarness } from '../RenderTestUtils';
import { buildRenderList, createTextCache, glyphCount, CommandKind } from './WebGPURenderData';

/**
 * Render-list budgets (WebGPU roadmap G7).
 *
 * The render-list builder is the one WebGPU stage vitest can reach, so
 * it is the one CI pins. The tree is the L7 layout budget's: a page, a
 * scroller, 500 fixed-height rows of five text columns — 10,502 nodes
 * of which a 1200×800 viewport shows about twenty rows. The counts are
 * hard budgets: instances, text runs and glyph instances must follow
 * the visible window, not the tree, at every scroll offset. Timings are
 * printed and capped well above their measured value.
 *
 * Two timings, because the glyph atlas made them different questions.
 * A **cold** build meets lines it has never shaped: it measures each
 * line's cluster positions once, and that is most of its cost. A
 * **warm** rebuild — the same text again, which is every frame of a
 * still or slowly scrolling screen — reuses the shaping and the atlas
 * cells and only writes instances. The second is the frame cost; the
 * first is what revealing a screenful of new text costs, once.
 */
describe('buildRenderList budgets', () => {
  const ROWS = 500;
  const COLUMNS_PER_ROW = 5;
  const TEXTS_PER_COLUMN = 3;
  const VIEWPORT = Constraints.loose(1200, 800);
  const ROW_HEIGHT = 40;
  const VISIBLE_ROWS = Math.ceil(800 / ROW_HEIGHT) + 1;
  /** Characters in the longest `Row 499 column 4 line 2`. */
  const LONGEST_ROW_TEXT = 23;

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
      const cache = createTextCache();
      const { result, ms } = timed(`cold build at scrollY ${scrollY}`, () =>
        buildRenderList(root, h.engine, h.measurer, 1200, 800, 1, Number.MAX_SAFE_INTEGER, [], cache)
      );
      const texts = result.textRuns.length;
      // One fill per visible row, plus the rows' text runs.
      expect(result.instanceCount, `instances at ${scrollY}`).toBeLessThanOrEqual(VISIBLE_ROWS);
      expect(result.instanceCount, `instances at ${scrollY}`).toBeGreaterThanOrEqual(VISIBLE_ROWS - 2);
      expect(texts, `text runs at ${scrollY}`).toBeLessThanOrEqual(VISIBLE_ROWS * COLUMNS_PER_ROW * TEXTS_PER_COLUMN);
      expect(texts, `text runs at ${scrollY}`).toBeGreaterThan(0);
      // Glyphs follow the window too: at most every character of every
      // visible run, and never a character of a row that is not mounted.
      const glyphs = glyphCount(result);
      expect(glyphs, `glyphs at ${scrollY}`).toBeGreaterThan(0);
      expect(glyphs, `glyphs at ${scrollY}`).toBeLessThanOrEqual(texts * LONGEST_ROW_TEXT);
      // Measured around 12 ms cold on a loaded machine; the cap is well
      // clear of it, because the cost here is shaping twenty rows of
      // text no frame has seen before.
      expect(ms, `cold build time at ${scrollY}`).toBeLessThan(120);

      const warm = timed(`warm build at scrollY ${scrollY}`, () =>
        buildRenderList(root, h.engine, h.measurer, 1200, 800, 1, Number.MAX_SAFE_INTEGER, [], cache)
      );
      expect(glyphCount(warm.result), `warm glyphs at ${scrollY}`).toBe(glyphs);
      // Measured around 2.4 ms for 4,950 glyph instances: no shaping,
      // no cell allocation, just the walk and the instance writes.
      expect(warm.ms, `warm build time at ${scrollY}`).toBeLessThan(40);
    }
  });

  it('keeps every text run under the scroller its row belongs to', () => {
    const h = new RenderHarness(1200, 800);
    const { root, list } = buildTree(h);
    list.setProperty('scrollY', 4000);
    h.layout(root, VIEWPORT);
    const result = buildRenderList(root, h.engine, h.measurer, 1200, 800, 1, Number.MAX_SAFE_INTEGER);
    for (const command of result.commands) {
      if (command.kind === CommandKind.Glyphs) {
        expect(command.scissor).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
      }
    }
  });
});

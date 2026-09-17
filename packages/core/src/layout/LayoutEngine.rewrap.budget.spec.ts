import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import type { FontMetrics, TextMeasureRequest } from './TextMeasurer';

/**
 * Re-wrap budgets (roadmap L1; `decisions/0090-what-a-resize-costs.md`).
 *
 * `scripts/bench-rewrap.ts` times a resize sweep over a screen of
 * paragraphs and reads the paragraph cache's hit rate off a counting
 * measurer. Its readings only mean something while three things hold,
 * and this is the tiny version of the sweep that keeps them true:
 *
 *   1. A new width lays every wrapping paragraph out again, exactly
 *      once. The cache is keyed on the request and the width is in the
 *      request (`decisions/0065`), so it cannot answer a width it has
 *      not seen; and the engine's several asks for one node in one
 *      pass are answered from the cache after the first.
 *   2. Text measured at its own width, a caption in a row, is the same
 *      request at every viewport width and is never laid out again.
 *   3. A width the cache has seen is answered from it: the return leg
 *      of a drag re-wraps nothing while its requests fit under the cap.
 *
 * Counts, not timings: what these guard is what the benchmark is
 * measuring, and a timing here would measure the CI machine.
 */
class CountingMeasurer extends CharacterCountTextMeasurer {
  calls = 0;
  misses = 0;

  constructor() {
    super({ glyphWidth: 1 });
  }

  override layout(request: TextMeasureRequest) {
    this.calls++;
    return super.layout(request);
  }

  /** `layoutParagraph` asks once per paragraph without runs; the cache never asks. */
  override fontMetrics(request: TextMeasureRequest): FontMetrics {
    this.misses++;
    return super.fontMetrics(request);
  }

  reset(): void {
    this.calls = 0;
    this.misses = 0;
  }
}

describe('re-wrap budgets', () => {
  const CARDS = 20;
  const HEIGHT = 800;
  /** A drag from 320 to 480 px and back, 32 px a step. */
  const WIDTHS = [320, 352, 384, 416, 448, 480, 448, 416, 384, 352, 320];

  function node(h: LayoutHarness, id: string, type: UiNodeType, props: Record<string, unknown>): UiNode {
    const created = h.createNode(id, type);
    for (const [name, value] of Object.entries(props)) {
      created.setProperty(name, value);
    }
    return created;
  }

  /** The benchmark's screen in miniature: a scroller of cards, each a title, a body and two captions. */
  function buildScreen(h: LayoutHarness): UiNode {
    const root = node(h, 'page', UiNodeType.Column, {});
    const list = node(h, 'feed', UiNodeType.ScrollView, { flex: 1 });
    h.append(root, list);
    for (let i = 0; i < CARDS; i++) {
      const card = node(h, `card-${i}`, UiNodeType.Column, { padding: 16, gap: 8 });
      const title = node(h, `title-${i}`, UiNodeType.Text, {
        text: `A title long enough to be cut short at the narrow end ${i}`,
        fontSize: 18,
        maxLines: 1,
        textOverflow: 'ellipsis'
      });
      const body = node(h, `body-${i}`, UiNodeType.Text, {
        text: `Paragraph ${i} of a card, with enough words in it to wrap several times at every width in the sweep and change its line count as the edge is dragged.`,
        fontSize: 14,
        lineHeight: 20
      });
      const meta = node(h, `meta-${i}`, UiNodeType.Row, { gap: 12 });
      h.append(meta, node(h, `author-${i}`, UiNodeType.Text, { text: `Author ${i}`, fontSize: 12 }));
      h.append(meta, node(h, `date-${i}`, UiNodeType.Text, { text: '15 September', fontSize: 12 }));
      h.append(card, title, body, meta);
      h.append(list, card);
    }
    return root;
  }

  function sweep(): { measurer: CountingMeasurer; steps: { width: number; calls: number; misses: number }[] } {
    const measurer = new CountingMeasurer();
    const h = new LayoutHarness(measurer);
    const root = buildScreen(h);
    // The mount, which is not a resize.
    h.layout(root, Constraints.loose(WIDTHS[0], HEIGHT));
    const steps: { width: number; calls: number; misses: number }[] = [];
    for (let i = 1; i < WIDTHS.length; i++) {
      measurer.reset();
      h.layout(root, Constraints.loose(WIDTHS[i], HEIGHT));
      steps.push({ width: WIDTHS[i], calls: measurer.calls, misses: measurer.misses });
    }
    return { measurer, steps };
  }

  it('lays every wrapping paragraph out exactly once at a width it has not seen', () => {
    const { steps } = sweep();
    const widening = steps.slice(0, 5);
    for (const step of widening) {
      // The title and the body of every card wrap against the viewport;
      // nothing else on the screen does.
      expect(step.misses, `misses at ${step.width}px`).toBe(CARDS * 2);
    }
  });

  it('asks the measurer a bounded number of times per text node per pass, and the cache answers the rest', () => {
    const { steps } = sweep();
    const textNodes = CARDS * 4;
    for (const step of steps) {
      expect(step.calls, `calls at ${step.width}px`).toBeGreaterThanOrEqual(textNodes);
      // Flex measures an item loose and then at its size, so a text
      // node is asked for two or three times a pass. Every ask after
      // the first is a hit, and a fourth would mean a pass had started
      // measuring something it already had.
      expect(step.calls, `calls at ${step.width}px`).toBeLessThanOrEqual(textNodes * 3);
    }
  });

  it('re-wraps nothing on the return leg while the widths it visits fit in the cache', () => {
    const { measurer, steps } = sweep();
    const narrowing = steps.slice(5);
    for (const step of narrowing) {
      expect(step.misses, `misses at ${step.width}px`).toBe(0);
    }
    // Two wrapping paragraphs per card per distinct width, plus two
    // entries per distinct caption (asked loose, then at its own width,
    // and both are the same request at every viewport width). Every
    // date reads the same, so the dates share one caption between them.
    // Well under the cap, which is why the leg above could hit.
    const distinctWidths = new Set(WIDTHS).size;
    const distinctCaptions = CARDS + 1;
    expect(measurer.cachedParagraphs).toBe(CARDS * 2 * distinctWidths + 2 * distinctCaptions);
  });
});

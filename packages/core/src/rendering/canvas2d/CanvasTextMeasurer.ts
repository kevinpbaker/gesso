import type { FontMetrics, TextMeasureRequest } from '../../layout/TextMeasurer';
import { ParagraphTextMeasurer } from '../../layout/TextMeasurer';
import { proportionalFontMetrics } from '../../layout/ParagraphLayout';
import type { Canvas2DContext } from './Canvas2DContext';
import { applyCanvasTextStyle, createCanvasTextStyle, runCanvasStyleInto } from '../TextRenderer';

const MAX_CACHE_ENTRIES = 8192;

/**
 * Canvas-backed measurer shared by the layout engine and the
 * renderers, so both always agree on text size.
 *
 * Only the two primitives live here — run width and font metrics —
 * and both are cached by font. Line breaking asks for a run width per
 * candidate line, so the width cache is what keeps wrapping cheap:
 * a stable paragraph re-laid out at the same width costs no
 * measureText calls at all.
 *
 * The cache is a flat map with a crude size cap: when the cap is
 * hit it is cleared wholesale. Revisit with an LRU only if profiling
 * shows measureText dominating.
 */
export class CanvasTextMeasurer extends ParagraphTextMeasurer {
  private readonly widths = new Map<string, number>();
  private readonly metrics = new Map<string, FontMetrics>();
  /** One style object per measurer, refilled per call; see `runCanvasStyleInto`. */
  private readonly style = createCanvasTextStyle();

  constructor(private readonly context: Canvas2DContext) {
    super();
  }

  measureRunWidth(text: string, request: TextMeasureRequest): number {
    // The font is built the one way drawing builds it, and its key is
    // the width cache's. The context is only touched on a miss:
    // assigning `font` re-parses the string, and this is the hottest
    // path in text.
    const key = `${runCanvasStyleInto(request, undefined, this.style)}\0${text}`;
    const cached = this.widths.get(key);
    if (cached !== undefined) {
      return cached;
    }
    applyCanvasTextStyle(this.context, this.style);
    const width = this.context.measureText(text).width;
    if (this.widths.size >= MAX_CACHE_ENTRIES) {
      this.widths.clear();
    }
    this.widths.set(key, width);
    return width;
  }

  /** Drops every cached width, metric and paragraph; see `TextMeasurer.invalidate`. */
  override invalidate(): void {
    super.invalidate();
    this.widths.clear();
    this.metrics.clear();
  }

  fontMetrics(request: TextMeasureRequest): FontMetrics {
    // Metrics are the font's own; tracking moves glyphs apart and does
    // not change how tall they are.
    const font = runCanvasStyleInto(request, undefined, this.style);
    this.style.letterSpacing = 0;
    const cached = this.metrics.get(font);
    if (cached !== undefined) {
      return cached;
    }
    applyCanvasTextStyle(this.context, this.style);
    const measured = this.context.measureText('Mg') as Partial<TextMetrics>;
    // fontBoundingBox* is the em box the browser lays lines out with.
    // Test doubles and very old engines lack it; fall back to the
    // proportions the deterministic measurer uses.
    const metrics =
      typeof measured.fontBoundingBoxAscent === 'number' && typeof measured.fontBoundingBoxDescent === 'number'
        ? { ascent: measured.fontBoundingBoxAscent, descent: measured.fontBoundingBoxDescent }
        : proportionalFontMetrics(request.fontSize);
    this.metrics.set(font, metrics);
    return metrics;
  }
}


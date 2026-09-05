import type { FontMetrics, TextMeasureRequest } from '../../layout/TextMeasurer';
import { ParagraphTextMeasurer } from '../../layout/TextMeasurer';
import { proportionalFontMetrics } from '../../layout/ParagraphLayout';
import type { Canvas2DContext } from './Canvas2DContext';
import { buildFontString } from '../TextRenderer';

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

  constructor(private readonly context: Canvas2DContext) {
    super();
  }

  measureRunWidth(text: string, request: TextMeasureRequest): number {
    const font = fontOf(request);
    const spacing = applySpacing(this.context, request);
    const key = `${font}\0${spacing}\0${text}`;
    const cached = this.widths.get(key);
    if (cached !== undefined) {
      return cached;
    }
    this.context.font = font;
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
    const font = fontOf(request);
    // Metrics are the font's own; tracking moves glyphs apart and does
    // not change how tall they are.
    applySpacing(this.context, { ...request, letterSpacing: 0 });
    const cached = this.metrics.get(font);
    if (cached !== undefined) {
      return cached;
    }
    this.context.font = font;
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

function fontOf(request: TextMeasureRequest): string {
  return buildFontString({
    fontWeight: request.fontWeight ?? 'normal',
    fontSize: request.fontSize,
    fontFamily: request.fontFamily ?? 'sans-serif'
  });
}

/**
 * Applies the request's tracking to a context, and says what it is.
 *
 * `letterSpacing` is a context property rather than part of the font
 * shorthand, so it has to be set separately and — because it is
 * *sticky* — cleared again for a run that asks for none. It also has
 * to go into the width cache's key, since two runs of the same text in
 * the same font are different widths at different tracking.
 *
 * Absent on an engine too old for it, in which case the assignment is
 * ignored, measuring and drawing both quietly do without, and the two
 * still agree — which is the only property that matters here.
 */
function applySpacing(context: Canvas2DContext, request: TextMeasureRequest): number {
  const spacing = request.letterSpacing ?? 0;
  (context as { letterSpacing?: string }).letterSpacing = `${spacing}px`;
  return spacing;
}

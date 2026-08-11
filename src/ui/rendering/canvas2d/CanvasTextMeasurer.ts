import type { Size } from '../../layout/LayoutTypes';
import type { TextMeasurer, TextMeasureRequest } from '../../layout/TextMeasurer';
import type { Canvas2DContext } from './Canvas2DContext';
import { buildFontString } from '../TextRenderer';

const DEFAULT_LINE_HEIGHT_FACTOR = 1.2;
const MAX_CACHE_ENTRIES = 4096;

/**
 * Canvas-backed TextMeasurer shared by the layout engine and the
 * renderer, so both always agree on text size.
 *
 * The requested font is installed on the context before measuring
 * (Canvas measureText reflects the current font). Measured widths
 * are cached by font + text + maxWidth, making repeated per-frame
 * measurement O(1) for stable content.
 *
 * The cache is a flat map with a crude size cap: when the cap is
 * hit it is cleared wholesale. Layout churn across thousands of
 * distinct strings may thrash it; revisit with an LRU only if
 * profiling shows measureText dominating.
 */
export class CanvasTextMeasurer implements TextMeasurer {
  private readonly cache = new Map<string, Size>();

  constructor(private readonly context: Canvas2DContext) {}

  measure(request: TextMeasureRequest): Size {
    const key = `${request.fontSize}|${request.fontFamily ?? ''}|${request.fontWeight ?? ''}|${request.lineHeight ?? ''}|${request.maxWidth ?? ''}|${request.text}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    this.context.font = buildFontString({
      fontWeight: request.fontWeight ?? 'normal',
      fontSize: request.fontSize,
      fontFamily: request.fontFamily ?? 'sans-serif'
    });
    const naturalWidth = this.context.measureText(request.text).width;
    let width = naturalWidth;
    if (request.maxWidth !== undefined && request.maxWidth >= 0) {
      width = Math.min(width, request.maxWidth);
    }
    const height = request.lineHeight ?? request.fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
    const size = { width, height };
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      this.cache.clear();
    }
    this.cache.set(key, size);
    return size;
  }
}

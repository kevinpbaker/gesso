import type { Size } from './LayoutTypes';
import { layoutParagraph, proportionalFontMetrics } from './ParagraphLayout';

export type TextWrap = 'word' | 'char' | 'none';
export type TextOverflow = 'clip' | 'ellipsis';

export interface TextMeasureRequest {
  text: string;
  fontSize: number;
  /** Available width. Wrapping and fit-content sizing happen against it. */
  maxWidth?: number;
  /**
   * Font family for platforms that can shape text.
   *
   * Deterministic measurers may ignore every style field; they
   * are hints for platform-backed implementations only.
   */
  fontFamily?: string;
  fontWeight?: string | number;
  lineHeight?: number;
  letterSpacing?: number;
  /** Default 'word'. */
  wrap?: TextWrap;
  /** Keep at most this many lines. */
  maxLines?: number;
  /** What happens to a line that does not fit. Default 'clip'. */
  overflow?: TextOverflow;
}

/** One laid-out line. `text` is what gets drawn and may end in an ellipsis. */
export interface TextLine {
  /** Offsets into the source text; hanging spaces and the ellipsis are outside them. */
  start: number;
  end: number;
  text: string;
  width: number;
}

export interface FontMetrics {
  /** Distance from the alphabetic baseline to the top of the glyph box. */
  ascent: number;
  /** Distance from the alphabetic baseline to the bottom of the glyph box. */
  descent: number;
}

/**
 * A measured paragraph: everything layout, alignment and painting need.
 *
 * `width` is fit-content, `height` is lines × lineHeight, and
 * `firstBaseline` is the distance from the paragraph top to the first
 * line's alphabetic baseline (half-leading plus ascent).
 */
export interface ParagraphLayout {
  lines: TextLine[];
  width: number;
  height: number;
  lineHeight: number;
  ascent: number;
  descent: number;
  firstBaseline: number;
  /** Widest unbreakable segment under the requested wrap mode. */
  minContentWidth: number;
  /** Width with no wrapping at all. */
  maxContentWidth: number;
}

/**
 * Abstraction between layout and text platforms.
 *
 * Layout never measures text itself; a platform layer
 * (Canvas2D, WebGPU, tests) supplies an implementation.
 */
export interface TextMeasurer {
  measure(request: TextMeasureRequest): Size;
  layout(request: TextMeasureRequest): ParagraphLayout;
  /**
   * The advance width of one run in the request's font. Caret and
   * selection geometry is built from prefix widths, so it has to come
   * from the same source as the line widths.
   */
  measureRunWidth(text: string, request: TextMeasureRequest): number;
  /**
   * Forgets every cached answer. Called when what a font string means
   * has changed under the measurer: a declared face finished loading,
   * so widths measured with its fallback are wrong now. Measurers with
   * nothing cached need not implement it.
   */
  invalidate?(): void;
}

/**
 * The primitive a platform has to provide: the advance width of one
 * run of text, and the font's vertical metrics. Everything above it
 * is shared (see ParagraphLayout.ts).
 */
export interface TextRunMeasurer {
  measureRunWidth(text: string, request: TextMeasureRequest): number;
  fontMetrics(request: TextMeasureRequest): FontMetrics;
}

/** Paragraphs remembered before the least recently asked for is forgotten. */
const PARAGRAPH_CACHE_ENTRIES = 4096;

/**
 * Base class for measurers: implement the two primitives and the
 * paragraph algorithm does the rest.
 *
 * **Every paragraph is laid out once per distinct request.** The same
 * request arrives several times a frame and on every frame after: the
 * layout engine asks when it measures the node, and both renderers ask
 * again when they paint it, because a `PaintState` and a box are all a
 * renderer holds. Without a cache a repaint is a line break, and a
 * transition that repaints the whole screen for half a second breaks
 * every paragraph on it sixty times a second. Measured on Sluice's
 * Bluesky feed opening a post: 30 to 50 ms a frame in `segmentParagraph`,
 * `measureRunWidth` and `applySpacing`, against under 13 ms on the same
 * click over short Wikipedia titles. The cache is keyed by every field
 * of the request, so a paragraph that changed in any way is laid out
 * again, and it is least-recently-used with a cap, so a feed that
 * mounts forty new rows a second does not grow it without bound.
 *
 * The result is shared between callers and must not be mutated.
 */
export abstract class ParagraphTextMeasurer implements TextMeasurer, TextRunMeasurer {
  private readonly paragraphs = new Map<string, ParagraphLayout>();

  abstract measureRunWidth(text: string, request: TextMeasureRequest): number;
  abstract fontMetrics(request: TextMeasureRequest): FontMetrics;

  layout(request: TextMeasureRequest): ParagraphLayout {
    const key = paragraphKey(request);
    const cached = this.paragraphs.get(key);
    if (cached !== undefined) {
      // Re-inserted so the map's order is recency, which is what the
      // eviction below reads.
      this.paragraphs.delete(key);
      this.paragraphs.set(key, cached);
      return cached;
    }
    const paragraph = layoutParagraph(request, this);
    if (this.paragraphs.size >= PARAGRAPH_CACHE_ENTRIES) {
      const oldest = this.paragraphs.keys().next().value;
      if (oldest !== undefined) {
        this.paragraphs.delete(oldest);
      }
    }
    this.paragraphs.set(key, paragraph);
    return paragraph;
  }

  measure(request: TextMeasureRequest): Size {
    const paragraph = this.layout(request);
    return { width: paragraph.width, height: paragraph.height };
  }

  /** How many paragraphs are remembered right now; for specs. */
  get cachedParagraphs(): number {
    return this.paragraphs.size;
  }

  /**
   * Forgets every laid-out paragraph. A subclass that caches its own
   * primitives overrides this and calls it, so a font that finished
   * loading invalidates the lines as well as the widths they were
   * built from.
   */
  invalidate(): void {
    this.paragraphs.clear();
  }
}

/** Every field of a request, in a fixed order; two requests that lay out alike share a key. */
function paragraphKey(request: TextMeasureRequest): string {
  return `${request.fontSize}\0${request.maxWidth ?? ''}\0${request.fontFamily ?? ''}\0${request.fontWeight ?? ''}\0${
    request.lineHeight ?? ''
  }\0${request.letterSpacing ?? ''}\0${request.wrap ?? ''}\0${request.maxLines ?? ''}\0${request.overflow ?? ''}\0${
    request.text
  }`;
}

export interface FixedMetricsOptions {
  /** Advance of every glyph as a fraction of the font size. Default 0.6. */
  glyphWidth?: number;
  /** Ascent as a fraction of the font size. Default 0.8. */
  ascent?: number;
  /** Descent as a fraction of the font size. Default 0.2. */
  descent?: number;
}

/**
 * Deterministic measurer: every glyph is `glyphWidth` em wide, the
 * font is `ascent + descent` em tall, and the default line is 1.2em.
 *
 * Intended for tests and headless environments. With `glyphWidth: 1`
 * it reproduces the Ahem test font exactly, which is how the layout
 * conformance fixtures compare real wrapping text against Chrome.
 */
export class CharacterCountTextMeasurer extends ParagraphTextMeasurer {
  private readonly glyphWidth: number;
  private readonly ascentFactor: number;
  private readonly descentFactor: number;

  constructor(options: FixedMetricsOptions = {}) {
    super();
    this.glyphWidth = options.glyphWidth ?? 0.6;
    this.ascentFactor = options.ascent ?? 0.8;
    this.descentFactor = options.descent ?? 0.2;
  }

  measureRunWidth(text: string, request: TextMeasureRequest): number {
    let glyphs = 0;
    for (const _character of text) {
      glyphs++;
    }
    return glyphs * request.fontSize * this.glyphWidth;
  }

  fontMetrics(request: TextMeasureRequest): FontMetrics {
    return proportionalFontMetrics(request.fontSize, this.ascentFactor, this.descentFactor);
  }
}

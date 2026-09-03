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

/**
 * Base class for measurers: implement the two primitives and the
 * paragraph algorithm does the rest.
 */
export abstract class ParagraphTextMeasurer implements TextMeasurer, TextRunMeasurer {
  abstract measureRunWidth(text: string, request: TextMeasureRequest): number;
  abstract fontMetrics(request: TextMeasureRequest): FontMetrics;

  layout(request: TextMeasureRequest): ParagraphLayout {
    return layoutParagraph(request, this);
  }

  measure(request: TextMeasureRequest): Size {
    const paragraph = this.layout(request);
    return { width: paragraph.width, height: paragraph.height };
  }
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

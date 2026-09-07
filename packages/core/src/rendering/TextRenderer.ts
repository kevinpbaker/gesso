import type { ParagraphLayout, TextMeasureRequest, TextMeasurer, TextRunStyle } from '../layout/TextMeasurer';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiColor } from '../properties/UiColor';
import type { Canvas2DContext } from './canvas2d/Canvas2DContext';
import type { PaintState, PaintTextSpan } from './PaintState';
import { colorToCss } from './PaintState';
import { fontStackFor } from './FontStacks';

/**
 * A positioned line ready to draw.
 */
export interface TextLinePlacement {
  text: string;
  /** Offsets into the source text the line covers; see TextLine. */
  start: number;
  end: number;
  /** Left edge of the line box after horizontal alignment. */
  x: number;
  /** Top edge of the line box. */
  y: number;
  /** Alphabetic baseline: where the glyphs are actually drawn. */
  baselineY: number;
  /** Measured width of the line. */
  width: number;
  /** Height of one line box. */
  height: number;
  /**
   * The line cut at its runs, present only for a paragraph with
   * spans. `x` is already in the line's space, so a renderer draws a
   * run without knowing where the line starts.
   */
  runs?: readonly PlacedTextRun[];
}

/** One run of a placed line. */
export interface PlacedTextRun {
  /** Index into the paint state's spans, or -1 for text outside every run. */
  span: number;
  start: number;
  end: number;
  text: string;
  x: number;
  width: number;
}

/**
 * A rectangle drawn with the text: a run's background, an underline, a
 * strikethrough.
 *
 * Both renderers fill these and neither computes them, which is what
 * keeps the two in step: a decoration that moved would move in both
 * pictures or in neither, and the parity gate would see nothing.
 */
export interface TextRunRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: UiColor;
}

/** How much of the hovered link's own colour washes behind it. */
const LINK_HOVER_ALPHA = 0.12;

/** One style object for every draw; see `runCanvasStyleInto`. */
const drawStyle: CanvasTextStyle = { font: '', letterSpacing: 0, fontStretch: 'normal', fontKerning: 'auto' };

/**
 * Pure text layout, separated from Canvas2D drawing.
 *
 * Asks the shared TextMeasurer for the paragraph — the same lines the
 * layout engine sized the node with — and resolves x/y per line for
 * the requested alignment. Nothing here touches a canvas, so the same
 * geometry drives Canvas2D, WebGPU and the tests.
 *
 * Glyphs sit on the alphabetic baseline, `firstBaseline` below each
 * line top (half-leading plus ascent), which is how CSS positions a
 * line box and what the layout engine uses for baseline alignment.
 */
export function layoutTextLines(box: LayoutBox, state: PaintState, measurer: TextMeasurer): TextLinePlacement[] {
  const text = state.text;
  if (text === undefined || text.length === 0 || state.fontSize <= 0) {
    return [];
  }
  return placeLines(box, state, measurer.layout(textMeasureRequest(text, state, box)));
}

/** The measure request paint makes for a node's text: the one layout made too. */
export function textMeasureRequest(
  text: string,
  state: Pick<
    PaintState,
    | 'fontSize'
    | 'fontFamily'
    | 'fontWeight'
    | 'lineHeight'
    | 'letterSpacing'
    | 'fontStyle'
    | 'fontStretch'
    | 'fontVariant'
    | 'fontKerning'
    | 'textWrap'
    | 'maxLines'
    | 'textOverflow'
    | 'spans'
  >,
  box: LayoutBox
): TextMeasureRequest {
  return {
    text,
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
    fontWeight: state.fontWeight,
    lineHeight: state.lineHeight > 0 ? state.lineHeight : undefined,
    // Tracking belongs in the request because it changes every width
    // in the paragraph. Paint left it out until spans arrived, so a
    // tracked label wrapped one way in layout and was re-laid-out
    // another way to be drawn, and cost two cache entries doing it.
    letterSpacing: state.letterSpacing,
    fontStyle: state.fontStyle,
    fontStretch: state.fontStretch,
    fontVariant: state.fontVariant,
    fontKerning: state.fontKerning,
    maxWidth: box.width > 0 ? box.width : undefined,
    wrap: state.textWrap,
    maxLines: state.maxLines,
    overflow: state.textOverflow,
    spans: state.spans
  };
}

/**
 * Positions a measured paragraph's lines in a box: x per line from the
 * horizontal alignment, y from the vertical alignment and line index.
 *
 * A line's runs are placed with it. In a right-to-left paragraph they
 * are placed from the right edge in reverse, because the canvas
 * reorders within one `fillText` and can no longer do it across two;
 * runs of mixed direction inside one line are still not reordered,
 * which is the limit `TextGeometry.ts` already states.
 */
export function placeLines(
  box: LayoutBox,
  state: Pick<PaintState, 'textAlign' | 'verticalAlign' | 'rtl'>,
  paragraph: ParagraphLayout
): TextLinePlacement[] {
  const offsetY = verticalOffset(state.verticalAlign, box.height, paragraph.height);
  const placements: TextLinePlacement[] = [];
  for (let i = 0; i < paragraph.lines.length; i++) {
    const line = paragraph.lines[i];
    const x = horizontalOffset(state.textAlign, state.rtl, box.x, box.width, line.width);
    const y = box.y + offsetY + i * paragraph.lineHeight;
    let runs: PlacedTextRun[] | undefined;
    if (line.runs !== undefined) {
      runs = [];
      for (const run of line.runs) {
        runs.push({
          span: run.span,
          start: run.start,
          end: run.end,
          text: run.text,
          x: state.rtl ? x + line.width - run.x - run.width : x + run.x,
          width: run.width
        });
      }
    }
    placements.push({
      text: line.text,
      start: line.start,
      end: line.end,
      x,
      y,
      baselineY: y + paragraph.firstBaseline,
      width: line.width,
      height: paragraph.lineHeight,
      runs
    });
  }
  return placements;
}

/**
 * Builds a Canvas2D font shorthand from a resolved text style.
 *
 * The family goes through `fontStackFor`, so a declared family carries
 * its fallback stack here and nowhere else: the measurer and both
 * renderers build their font strings with this function.
 *
 * The order is the CSS `font` shorthand's, style then variant then
 * weight then size then family, and it is the whole of what a canvas
 * font string can say. A variable font's `wght` is reached through a
 * numeric weight, `wdth` through `fontStretch` — a context property,
 * not part of this string — and `tnum` and `liga` are not reachable at
 * all; `decisions/0085` records the measurement that says so.
 */
export function buildFontString(
  state: Pick<PaintState, 'fontWeight' | 'fontSize' | 'fontFamily'> & { fontStyle?: string; fontVariant?: string }
): string {
  const style = state.fontStyle !== undefined && state.fontStyle !== 'normal' ? `${state.fontStyle} ` : '';
  const variant = state.fontVariant !== undefined && state.fontVariant !== 'normal' ? `${state.fontVariant} ` : '';
  return `${style}${variant}${String(state.fontWeight)} ${state.fontSize}px ${fontStackFor(state.fontFamily)}`;
}

/**
 * The font shorthand for one run of a measure request: the run's own
 * fields where it sets them, the paragraph's where it does not.
 */
export function runFontString(request: TextRunStyle, style: TextRunStyle | undefined): string {
  return buildFontString({
    fontWeight: style?.fontWeight ?? request.fontWeight ?? 'normal',
    fontSize: style?.fontSize ?? request.fontSize ?? 0,
    fontFamily: style?.fontFamily ?? request.fontFamily ?? 'sans-serif',
    fontStyle: style?.fontStyle ?? request.fontStyle,
    fontVariant: style?.fontVariant ?? request.fontVariant
  });
}

/**
 * Everything about how a run is drawn that a canvas can be told.
 *
 * The font shorthand carries style, variant, weight, size and family.
 * The other three are context properties, and all three are *sticky*:
 * set once and every run drawn after inherits them, so each is written
 * on every apply, including back to its default.
 */
export interface CanvasTextStyle {
  font: string;
  letterSpacing: number;
  fontStretch: string;
  fontKerning: string;
}

/** A style object to fill, so the hot path allocates none. */
export function createCanvasTextStyle(): CanvasTextStyle {
  return { font: '', letterSpacing: 0, fontStretch: 'normal', fontKerning: 'auto' };
}

/**
 * Fills a caller-owned style with one run's font, and returns the key
 * that identifies it.
 *
 * The key is what the width cache is keyed by, and it has to carry the
 * three sticky properties as well as the font string, since two runs
 * of the same text in the same font are different widths at different
 * tracking, in a different width axis, or with kerning off. Measuring
 * and drawing both come through here, which is the only reason a width
 * can be trusted to describe the glyphs that get drawn.
 */
export function runCanvasStyleInto(
  request: TextRunStyle,
  style: TextRunStyle | undefined,
  out: CanvasTextStyle
): string {
  out.font = runFontString(request, style);
  out.letterSpacing = style?.letterSpacing ?? request.letterSpacing ?? 0;
  out.fontStretch = style?.fontStretch ?? request.fontStretch ?? 'normal';
  out.fontKerning = style?.fontKerning ?? request.fontKerning ?? 'auto';
  return `${out.font}\0${out.letterSpacing}\0${out.fontStretch}\0${out.fontKerning}`;
}

/**
 * Sets a run's font on a context.
 *
 * An engine too old for one of the three context properties ignores
 * the assignment, measuring and drawing both quietly do without, and
 * the two still agree, which is the only property that matters here.
 */
export function applyCanvasTextStyle(context: Canvas2DContext, style: CanvasTextStyle): void {
  context.font = style.font;
  const mutable = context as { letterSpacing?: string; fontStretch?: string; fontKerning?: string };
  mutable.letterSpacing = `${style.letterSpacing}px`;
  mutable.fontStretch = style.fontStretch;
  mutable.fontKerning = style.fontKerning;
}

/**
 * Draws a node's text into a 2D context.
 *
 * All style fields used are assigned before the first fillText, so
 * no state leaks between nodes and no save/restore is needed. Lines
 * are drawn at their measured width — never squeezed with fillText's
 * maxWidth — because the paragraph layout already decided how the
 * text fits: it wrapped, was ellipsised, or overflows exactly as CSS
 * would.
 */
export function drawText(ctx: Canvas2DContext, box: LayoutBox, state: PaintState, measurer: TextMeasurer): void {
  const placements = layoutTextLines(box, state, measurer);
  fillTextRects(ctx, textRunBackgrounds(placements, state));
  drawTextLines(
    ctx,
    placements,
    buildFontString(state),
    colorToCss(state.textColor),
    state.letterSpacing,
    state.rtl,
    state
  );
  fillTextRects(ctx, textRunDecorations(placements, state));
}

/**
 * Draws already-placed lines in one font and colour.
 *
 * `letterSpacing` is passed separately because it is not part of the
 * font shorthand, and it is set on every call rather than only when
 * non-zero because the context keeps it: a label with tracking would
 * otherwise leave every run drawn after it spaced out too. `rtl` is
 * the paragraph's base direction, set the same way and for the same
 * reason: the canvas keeps it, and it decides which side a neutral
 * character at the end of a line lands on. Lines are placed by
 * `placeLines` already, so the canvas's own alignment stays `left`.
 *
 * A line with runs is drawn run by run instead, each in its own font
 * and colour, at the x the paragraph measured for it. Everything about
 * where a run sits was decided in layout, so this is the same walk in
 * a different order and asks the platform to measure nothing.
 */
export function drawTextLines(
  ctx: Canvas2DContext,
  placements: readonly TextLinePlacement[],
  font: string,
  color: string,
  letterSpacing = 0,
  rtl = false,
  state?: SpanPaint
): void {
  if (placements.length === 0) {
    return;
  }
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  drawStyle.font = font;
  drawStyle.letterSpacing = letterSpacing;
  drawStyle.fontStretch = state?.fontStretch ?? 'normal';
  drawStyle.fontKerning = state?.fontKerning ?? 'auto';
  applyCanvasTextStyle(ctx, drawStyle);
  ctx.fillStyle = color;
  for (const placement of placements) {
    if (placement.runs !== undefined && state !== undefined) {
      for (const run of placement.runs) {
        if (run.text.length === 0) {
          continue;
        }
        const span = spanOf(state, run.span);
        runCanvasStyleInto(state, span, drawStyle);
        applyCanvasTextStyle(ctx, drawStyle);
        ctx.fillStyle = colorToCss(span?.color ?? state.textColor);
        ctx.fillText(run.text, run.x, placement.baselineY);
      }
      continue;
    }
    if (placement.text.length > 0) {
      ctx.fillText(placement.text, placement.x, placement.baselineY);
    }
  }
}

/** Fills rectangles that came from `textRunBackgrounds` or `textRunDecorations`. */
export function fillTextRects(ctx: Canvas2DContext, rects: readonly TextRunRect[]): void {
  for (const rect of rects) {
    ctx.fillStyle = colorToCss(rect.color);
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}

/**
 * The paint half of a paragraph's runs: what a renderer needs that the
 * measure request does not carry.
 */
export type SpanPaint = Pick<
  PaintState,
  | 'spans'
  | 'textColor'
  | 'fontSize'
  | 'fontFamily'
  | 'fontWeight'
  | 'letterSpacing'
  | 'fontStyle'
  | 'fontStretch'
  | 'fontVariant'
  | 'fontKerning'
  | 'textDecoration'
  | 'linkHover'
>;

/**
 * The rectangles painted behind a paragraph's glyphs: a run's own
 * background, and the wash under the link the pointer is on.
 *
 * A background fills the line box rather than the glyph box, as a CSS
 * inline background does, so two adjacent runs of the same colour read
 * as one band.
 */
export function textRunBackgrounds(placements: readonly TextLinePlacement[], state: SpanPaint): readonly TextRunRect[] {
  if (state.spans === undefined) {
    return EMPTY_RECTS;
  }
  const rects: TextRunRect[] = [];
  for (const placement of placements) {
    if (placement.runs === undefined) {
      continue;
    }
    for (const run of placement.runs) {
      const span = spanOf(state, run.span);
      if (span === undefined) {
        continue;
      }
      if (span.backgroundColor !== undefined) {
        rects.push({
          x: run.x,
          y: placement.y,
          width: run.width,
          height: placement.height,
          color: span.backgroundColor
        });
      }
      if (run.span === state.linkHover && span.link !== undefined) {
        const color = span.color ?? state.textColor;
        rects.push({
          x: run.x,
          y: placement.y,
          width: run.width,
          height: placement.height,
          color: { r: color.r, g: color.g, b: color.b, a: color.a * LINK_HOVER_ALPHA }
        });
      }
    }
  }
  return rects;
}

/**
 * The lines drawn with a paragraph: underline and strikethrough, per
 * run where a run asks for them and across the whole paragraph where
 * the node does.
 *
 * The offsets are a fraction of the font size rather than the font's
 * own underline position, because a canvas font string cannot be asked
 * for that metric and `TextMetrics` does not carry it. They are
 * rounded to whole pixels so a hairline stays a hairline, and computed
 * here rather than in either renderer so the two cannot drift.
 *
 * A link the pointer is on is underlined whether or not it asked to
 * be, which is the hover state a link owes the person using it.
 */
export function textRunDecorations(placements: readonly TextLinePlacement[], state: SpanPaint): readonly TextRunRect[] {
  const paragraphDecoration = state.textDecoration ?? 'none';
  if (paragraphDecoration === 'none' && state.spans === undefined) {
    return EMPTY_RECTS;
  }
  const rects: TextRunRect[] = [];
  for (const placement of placements) {
    if (placement.runs === undefined) {
      if (paragraphDecoration !== 'none' && placement.text.length > 0) {
        push(
          rects,
          paragraphDecoration,
          placement.x,
          placement.width,
          placement.baselineY,
          state.fontSize,
          state.textColor
        );
      }
      continue;
    }
    for (const run of placement.runs) {
      if (run.text.length === 0) {
        continue;
      }
      const span = spanOf(state, run.span);
      const hovered = run.span === state.linkHover && span?.link !== undefined;
      let decoration = span?.textDecoration ?? paragraphDecoration;
      if (hovered && decoration !== 'underline line-through') {
        decoration = decoration === 'line-through' ? 'underline line-through' : 'underline';
      }
      if (decoration === 'none') {
        continue;
      }
      push(
        rects,
        decoration,
        run.x,
        run.width,
        placement.baselineY,
        span?.fontSize ?? state.fontSize,
        span?.color ?? state.textColor
      );
    }
  }
  return rects;
}

const EMPTY_RECTS: readonly TextRunRect[] = [];

function push(
  rects: TextRunRect[],
  decoration: string,
  x: number,
  width: number,
  baselineY: number,
  fontSize: number,
  color: UiColor
): void {
  const thickness = Math.max(1, Math.round(fontSize / 14));
  if (decoration.includes('underline')) {
    rects.push({ x, y: Math.round(baselineY + Math.max(1, fontSize * 0.08)), width, height: thickness, color });
  }
  if (decoration.includes('line-through')) {
    rects.push({ x, y: Math.round(baselineY - fontSize * 0.28), width, height: thickness, color });
  }
}

/** The span a run came from, or undefined for text outside every run. */
export function spanOf(state: Pick<PaintState, 'spans'>, index: number): PaintTextSpan | undefined {
  return index < 0 || state.spans === undefined ? undefined : state.spans[index];
}

/** `start` and `end` follow the paragraph's direction; `left` and `right` do not. */
function horizontalOffset(align: string, rtl: boolean, x: number, width: number, lineWidth: number): number {
  switch (align) {
    case 'center':
      return x + (width - lineWidth) / 2;
    case 'right':
      return x + width - lineWidth;
    case 'left':
      return x;
    case 'end':
      return rtl ? x : x + width - lineWidth;
    default:
      return rtl ? x + width - lineWidth : x;
  }
}

function verticalOffset(align: string, boxHeight: number, contentHeight: number): number {
  switch (align) {
    case 'middle':
      return (boxHeight - contentHeight) / 2;
    case 'bottom':
      return boxHeight - contentHeight;
    default:
      return 0;
  }
}

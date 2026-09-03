import type { ParagraphLayout, TextMeasureRequest, TextMeasurer } from '../layout/TextMeasurer';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { Canvas2DContext } from './canvas2d/Canvas2DContext';
import type { PaintState } from './PaintState';
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
}

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
    'fontSize' | 'fontFamily' | 'fontWeight' | 'lineHeight' | 'textWrap' | 'maxLines' | 'textOverflow'
  >,
  box: LayoutBox
): TextMeasureRequest {
  return {
    text,
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
    fontWeight: state.fontWeight,
    lineHeight: state.lineHeight > 0 ? state.lineHeight : undefined,
    maxWidth: box.width > 0 ? box.width : undefined,
    wrap: state.textWrap,
    maxLines: state.maxLines,
    overflow: state.textOverflow
  };
}

/**
 * Positions a measured paragraph's lines in a box: x per line from the
 * horizontal alignment, y from the vertical alignment and line index.
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
    placements.push({
      text: line.text,
      start: line.start,
      end: line.end,
      x,
      y,
      baselineY: y + paragraph.firstBaseline,
      width: line.width,
      height: paragraph.lineHeight
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
 */
export function buildFontString(state: Pick<PaintState, 'fontWeight' | 'fontSize' | 'fontFamily'>): string {
  return `${String(state.fontWeight)} ${state.fontSize}px ${fontStackFor(state.fontFamily)}`;
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
  drawTextLines(
    ctx,
    layoutTextLines(box, state, measurer),
    buildFontString(state),
    colorToCss(state.textColor),
    state.letterSpacing,
    state.rtl
  );
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
 */
export function drawTextLines(
  ctx: Canvas2DContext,
  placements: readonly TextLinePlacement[],
  font: string,
  color: string,
  letterSpacing = 0,
  rtl = false
): void {
  if (placements.length === 0) {
    return;
  }
  ctx.font = font;
  ctx.letterSpacing = `${letterSpacing}px`;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const placement of placements) {
    if (placement.text.length > 0) {
      ctx.fillText(placement.text, placement.x, placement.baselineY);
    }
  }
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

import type { TextMeasurer } from '../layout/TextMeasurer';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { Canvas2DContext } from './canvas2d/Canvas2DContext';
import type { PaintState } from './PaintState';
import { colorToCss } from './PaintState';

/**
 * A positioned line ready to draw.
 */
export interface TextLinePlacement {
  text: string;
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
  const paragraph = measurer.layout({
    text,
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
    fontWeight: state.fontWeight,
    lineHeight: state.lineHeight > 0 ? state.lineHeight : undefined,
    maxWidth: box.width > 0 ? box.width : undefined,
    wrap: state.textWrap,
    maxLines: state.maxLines,
    overflow: state.textOverflow
  });
  const offsetY = verticalOffset(state.verticalAlign, box.height, paragraph.height);
  const placements: TextLinePlacement[] = [];
  for (let i = 0; i < paragraph.lines.length; i++) {
    const line = paragraph.lines[i];
    const x = horizontalOffset(state.textAlign, box.x, box.width, line.width);
    const y = box.y + offsetY + i * paragraph.lineHeight;
    placements.push({
      text: line.text,
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
 */
export function buildFontString(state: Pick<PaintState, 'fontWeight' | 'fontSize' | 'fontFamily'>): string {
  return `${String(state.fontWeight)} ${state.fontSize}px ${state.fontFamily}`;
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
  if (placements.length === 0) {
    return;
  }
  ctx.font = buildFontString(state);
  ctx.fillStyle = colorToCss(state.textColor);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const placement of placements) {
    ctx.fillText(placement.text, placement.x, placement.baselineY);
  }
}

function horizontalOffset(align: string, x: number, width: number, lineWidth: number): number {
  switch (align) {
    case 'center':
      return x + (width - lineWidth) / 2;
    case 'right':
      return x + width - lineWidth;
    default:
      return x;
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

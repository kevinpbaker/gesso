import type { TextMeasurer } from '../layout/TextMeasurer';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { Canvas2DContext } from './canvas2d/Canvas2DContext';
import type { PaintState } from './PaintState';
import { DEFAULT_LINE_HEIGHT_FACTOR } from './PaintState';

/**
 * A positioned line ready to draw.
 */
export interface TextLinePlacement {
  text: string;
  x: number;
  y: number;
  /** Measured width of the line. */
  width: number;
  /** Height of one line box. */
  height: number;
}

/**
 * Pure text layout, separated from Canvas2D drawing.
 *
 * Splits the text into lines, measures each line through the shared
 * TextMeasurer (the same abstraction the layout engine uses) and
 * resolves x/y for the requested alignment. Nothing here touches a
 * canvas, so the same geometry drives layout, tests, and a future
 * WebGPU backend.
 *
 * The baseline used for drawing is the text top ('top' baseline),
 * so placement.y is the top edge of the line box.
 */
export function layoutTextLines(box: LayoutBox, state: PaintState, measurer: TextMeasurer): TextLinePlacement[] {
  const text = state.text;
  if (text === undefined || text.length === 0 || state.fontSize <= 0) {
    return [];
  }
  const lines = splitLines(text);
  const lineHeight = state.lineHeight > 0 ? state.lineHeight : state.fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
  const maxWidth = box.width > 0 ? box.width : undefined;
  const totalHeight = lines.length * lineHeight;
  const offsetY = verticalOffset(state.verticalAlign, box.height, totalHeight);
  const placements: TextLinePlacement[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const size = measurer.measure({
      text: line,
      fontSize: state.fontSize,
      fontFamily: state.fontFamily,
      fontWeight: state.fontWeight,
      lineHeight,
      maxWidth
    });
    const x = horizontalOffset(state.textAlign, box.x, box.width, size.width);
    const y = box.y + offsetY + i * lineHeight;
    placements.push({ text: line, x, y, width: size.width, height: lineHeight });
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
 * no state leaks between nodes and no save/restore is needed.
 */
export function drawText(ctx: Canvas2DContext, box: LayoutBox, state: PaintState, measurer: TextMeasurer): void {
  const placements = layoutTextLines(box, state, measurer);
  if (placements.length === 0) {
    return;
  }
  ctx.font = buildFontString(state);
  ctx.fillStyle = state.textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const maxWidth = box.width > 0 ? box.width : undefined;
  for (const placement of placements) {
    ctx.fillText(placement.text, placement.x, placement.y, maxWidth);
  }
}

function splitLines(text: string): string[] {
  if (text.indexOf('\n') < 0) {
    return [text];
  }
  return text.split('\n');
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

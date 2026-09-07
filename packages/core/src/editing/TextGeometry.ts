import type { LayoutBox } from '../layout/LayoutTypes';
import { graphemeBoundaries } from './TextBoundaries';

/**
 * A placed line, as `placeLines` in the text renderer produces: the
 * source offsets it covers, its box after alignment, and its text.
 */
export interface PlacedLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The advance width of a run in the paragraph's font.
 *
 * `start` is the run's first character's offset in the source text,
 * and is what a paragraph with runs of its own needs to know which
 * font to measure in; a paragraph in one font ignores it. Omitted for
 * a string that is not in the text at all, such as the space a
 * selection past the end of a line is widened by.
 */
export type RunMeasure = (text: string, start?: number) => number;

export interface CaretRect {
  x: number;
  y: number;
  height: number;
  /** Index of the line the caret is on. */
  line: number;
}

/**
 * Caret and selection geometry over laid-out lines.
 *
 * The lines are the paragraph the layout engine sized the node with
 * and the renderer draws, so a caret computed here sits exactly where
 * the glyphs are. Widths come from the same measurer: the x of offset
 * `n` on a line is the width of that line's first `n` characters.
 *
 * Direction: `rtl` mirrors every x against the line's right edge, so a
 * right-to-left paragraph places its caret and selection from the
 * right. Runs of mixed direction within one line are not reordered —
 * the renderers do not shape them either — so this is direction-aware
 * rather than fully bidirectional, and says so.
 */

/**
 * The line an offset belongs to. Hanging spaces at a wrap belong to
 * the line before the break; the first character after the break
 * starts the next line.
 */
export function lineIndexForOffset(lines: readonly PlacedLine[], offset: number): number {
  let index = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].start <= offset) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}

/**
 * The offset a line's caret positions run to, hanging spaces included:
 * the text's end on the last line, else up to the break — the newline
 * character itself, or the first character of the next line.
 *
 * `line.end` stops at the last glyph, since spaces at a wrap hang and
 * have no width in layout. The caret still has to move through them,
 * as it does in a textarea, so geometry measures them from `text`.
 */
export function lineLimit(lines: readonly PlacedLine[], index: number, text: string): number {
  if (index >= lines.length - 1) {
    return text.length;
  }
  const nextStart = lines[index + 1].start;
  return nextStart > 0 && text[nextStart - 1] === '\n' ? nextStart - 1 : nextStart;
}

/** The advance from a line's start to `offset`, through hanging spaces if need be. */
function advanceTo(line: PlacedLine, offset: number, text: string, measure: RunMeasure): number {
  const inLine = Math.max(0, offset - line.start);
  if (inLine === 0) {
    return 0;
  }
  if (inLine === line.text.length) {
    return line.width;
  }
  return measure(inLine < line.text.length ? line.text.slice(0, inLine) : text.slice(line.start, offset), line.start);
}

/** Where the caret for `offset` is drawn. */
export function caretRectFor(
  lines: readonly PlacedLine[],
  text: string,
  offset: number,
  measure: RunMeasure,
  rtl: boolean
): CaretRect {
  const index = lineIndexForOffset(lines, offset);
  const line = lines[index];
  const advance = advanceTo(line, Math.min(offset, lineLimit(lines, index, text)), text, measure);
  return { x: rtl ? line.x + line.width - advance : line.x + advance, y: line.y, height: line.height, line: index };
}

/** The line whose box contains `y`, clamped to the first and last. */
export function lineIndexAtY(lines: readonly PlacedLine[], y: number): number {
  if (y < lines[0].y) {
    return 0;
  }
  for (let i = 0; i < lines.length; i++) {
    if (y < lines[i].y + lines[i].height) {
      return i;
    }
  }
  return lines.length - 1;
}

/** The caret position nearest to a point: the boundary closest to `x` on the line under `y`. */
export function offsetAtPoint(
  lines: readonly PlacedLine[],
  text: string,
  x: number,
  y: number,
  measure: RunMeasure,
  rtl: boolean
): number {
  const index = lineIndexAtY(lines, y);
  return offsetAtX(lines, index, text, x, measure, rtl);
}

/**
 * The caret position on one line nearest to `x`. Widths grow with the
 * prefix, so the boundary is found by bisection: O(log n) measures per
 * click on a line of n graphemes.
 *
 * On the last line the trailing spaces are positions too, so a click
 * past the text lands after them. On a wrapped line the hanging spaces
 * are not: a click past the glyphs stops before the break, as it does
 * in a textarea.
 */
export function offsetAtX(
  lines: readonly PlacedLine[],
  index: number,
  text: string,
  x: number,
  measure: RunMeasure,
  rtl: boolean
): number {
  const line = lines[index];
  const segment = index === lines.length - 1 ? text.slice(line.start, lineLimit(lines, index, text)) : line.text;
  const segmentWidth = segment.length === line.text.length ? line.width : measure(segment, line.start);
  const distance = rtl ? line.x + line.width - x : x - line.x;
  if (distance <= 0) {
    return line.start;
  }
  if (distance >= segmentWidth) {
    return line.start + segment.length;
  }
  const boundaries = graphemeBoundaries(segment);
  const widthAt = (k: number): number => (k === 0 ? 0 : measure(segment.slice(0, boundaries[k]), line.start));
  let low = 0;
  let high = boundaries.length - 1;
  // Smallest k whose prefix width reaches the point.
  while (low < high) {
    const mid = (low + high) >> 1;
    if (widthAt(mid) < distance) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  if (low > 0) {
    const before = widthAt(low - 1);
    const after = widthAt(low);
    if (distance - before < after - distance) {
      low--;
    }
  }
  return line.start + boundaries[low];
}

/**
 * The offset a vertical move lands on: the position nearest the
 * caret's x (or `goalX`, the x of the line the run of moves started
 * on) on the adjacent line. Null when there is no line that way, which
 * callers turn into "go to the start / end of the text".
 */
export function offsetForVerticalMove(
  lines: readonly PlacedLine[],
  text: string,
  offset: number,
  direction: -1 | 1,
  measure: RunMeasure,
  rtl: boolean,
  goalX?: number
): { offset: number; x: number } | null {
  const caret = caretRectFor(lines, text, offset, measure, rtl);
  const target = caret.line + direction;
  if (target < 0 || target >= lines.length) {
    return null;
  }
  const x = goalX ?? caret.x;
  return { offset: offsetAtX(lines, target, text, x, measure, rtl), x };
}

/**
 * The boxes covering `[start, end)`, one per line touched. Hanging
 * spaces inside the range are highlighted at their width; a line the
 * range runs past with nothing hanging gets a space's width more, so a
 * selected line break is visible.
 */
export function selectionRects(
  lines: readonly PlacedLine[],
  text: string,
  start: number,
  end: number,
  measure: RunMeasure,
  rtl: boolean
): LayoutBox[] {
  if (end <= start) {
    return [];
  }
  const rects: LayoutBox[] = [];
  const first = lineIndexForOffset(lines, start);
  const last = lineIndexForOffset(lines, Math.max(start, end - 1));
  for (let i = first; i <= last; i++) {
    const line = lines[i];
    const limit = lineLimit(lines, i, text);
    const fromX = advanceTo(line, Math.max(line.start, Math.min(start, limit)), text, measure);
    let toX = advanceTo(line, Math.min(end, limit), text, measure);
    if (end > limit && i < lines.length - 1 && limit === line.end) {
      toX += measure(' ');
    }
    if (toX <= fromX) {
      continue;
    }
    rects.push({
      x: rtl ? line.x + line.width - toX : line.x + fromX,
      y: line.y,
      width: toX - fromX,
      height: line.height
    });
  }
  return rects;
}

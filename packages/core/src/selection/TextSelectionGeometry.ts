import type { LayoutBox } from '../layout/LayoutTypes';
import type { TextMeasurer } from '../layout/TextMeasurer';
import { spannedRunsFor } from '../layout/TextMeasurer';
import type { PaintState } from '../rendering/PaintState';
import { placeLines, textMeasureRequest, type TextLinePlacement } from '../rendering/TextRenderer';
import { lineIndexAtY, offsetAtPoint, selectionRects, type RunMeasure } from '../editing/TextGeometry';
import { visibleWordRange } from '../editing/HiddenText';
import { hiddenRangesOf, type UiTextRange } from '../properties/UiTextStyle';

const NO_RANGES: readonly UiTextRange[] = [];

/**
 * A laid-out paragraph, ready to answer the two questions a selection
 * asks of it: which offset is under a point, and which boxes cover a
 * range.
 *
 * This is `EditableLayout` for text nobody types into, and the
 * difference is the reason it is its own thing: an editable never
 * clamps, so every character it holds has a caret position, while a
 * `Text` node may be capped by `maxLines` and ellipsised. Only what is
 * drawn can be measured, so `text` here is the source truncated to the
 * last drawn line — which keeps the geometry helpers, written for the
 * un-clamped case, correct without a clamp-aware branch in each of
 * them.
 *
 * What is cut is still the node's text, though. `text-overflow` is
 * presentation in CSS, and a browser copies the whole string once a
 * selection reaches the ellipsis; copying only the drawn glyphs handed
 * the clipboard 'Brand Story & Brand' for a title that was longer. So
 * the hidden tail is addressable as one position, `sourceEnd`, which
 * the far side of the ellipsis (or, with no ellipsis, the space past
 * the last glyph) maps to. Offsets between `end` and `sourceEnd` have
 * no geometry of their own: a range reaching into them lights the
 * ellipsis.
 */
export interface ParagraphGeometry {
  readonly lines: readonly TextLinePlacement[];
  /** The source text, truncated to what the lines actually draw. */
  readonly text: string;
  /** Offset the drawn text starts at; always 0 today, kept for symmetry with `end`. */
  readonly start: number;
  /** Offset the drawn text ends at: past it there is nothing to measure. */
  readonly end: number;
  /** The whole source text, the part the lines do not draw included. */
  readonly source: string;
  /**
   * Offset a selection may run to: the end of `source` when the lines
   * dropped any of it, else `end`. A clamp that dropped only blanks
   * hides nothing worth copying, so it is not treated as a truncation.
   */
  readonly sourceEnd: number;
  readonly measure: RunMeasure;
  readonly rtl: boolean;
  /** Stretches of the text its runs hide; a double click selects words as drawn. */
  readonly hidden: readonly UiTextRange[];
}

/**
 * Lays a node's text out in its content box, exactly as the renderers
 * draw it: the same measure request, so the lines are the ones on
 * screen.
 *
 * `box` is in whatever space the caller works in — node-local for
 * input, the parent's content space for paint — and the offsets and
 * boxes come back in that space.
 */
export function paragraphGeometry(
  text: string,
  box: LayoutBox,
  state: PaintState,
  measurer: TextMeasurer
): ParagraphGeometry {
  const request = textMeasureRequest(text, state, box);
  const lines = placeLines(box, state, measurer.layout(request));
  return geometryFor(lines, text, request, state, measurer);
}

/**
 * The same geometry over lines a caller has already placed. Both
 * renderers lay a paragraph out to draw it, so a selected one is not
 * laid out twice.
 */
export function paragraphGeometryFrom(
  lines: readonly TextLinePlacement[],
  text: string,
  box: LayoutBox,
  state: PaintState,
  measurer: TextMeasurer
): ParagraphGeometry {
  return geometryFor(lines, text, textMeasureRequest(text, state, box), state, measurer);
}

function geometryFor(
  lines: readonly TextLinePlacement[],
  text: string,
  request: ReturnType<typeof textMeasureRequest>,
  state: PaintState,
  measurer: TextMeasurer
): ParagraphGeometry {
  const end = lines.length === 0 ? 0 : lines[lines.length - 1].end;
  // Runs are measured by offset, in the font of the run each piece
  // falls in, exactly as the paragraph algorithm measured the lines
  // these came from. Without the offset there is no run to look up,
  // which is the case for a string that is not in the text.
  const spanned = spannedRunsFor(request, measurer);
  const truncated = end < text.length && /\S/.test(text.slice(end));
  return {
    lines,
    text: end === text.length ? text : text.slice(0, end),
    start: lines.length === 0 ? 0 : lines[0].start,
    end,
    source: text,
    sourceEnd: truncated ? text.length : end,
    measure: (run, from) =>
      run.length === 0
        ? 0
        : spanned === undefined || from === undefined
          ? measurer.measureRunWidth(run, request)
          : spanned.width(text, from, from + run.length),
    rtl: state.rtl,
    hidden: state.spans === undefined ? NO_RANGES : hiddenRangesOf(state.spans)
  };
}

/** Whether anything in this paragraph can be selected at all. */
export function hasDrawnText(geometry: ParagraphGeometry): boolean {
  return geometry.lines.length > 0 && geometry.end > geometry.start;
}

/**
 * The offset nearest a point: within the drawn text, or `sourceEnd`
 * when the point is past the last drawn glyph of a truncated paragraph.
 */
export function offsetAtPointIn(geometry: ParagraphGeometry, x: number, y: number): number {
  const lines = geometry.lines;
  if (lines.length === 0) {
    return 0;
  }
  const offset = offsetAtPoint(lines, geometry.text, x, y, geometry.measure, geometry.rtl);
  if (offset !== geometry.end || geometry.sourceEnd === geometry.end || lineIndexAtY(lines, y) !== lines.length - 1) {
    return offset;
  }
  // The ellipsis is one glyph for the whole hidden tail, so it takes
  // the caret rule every glyph does: the near half is the boundary
  // before it, the far half the boundary after it, which is the end of
  // the source. Without an ellipsis the half is zero wide, and any
  // point past the last glyph reaches the hidden text.
  const line = lines[lines.length - 1];
  const drawn = drawnWidth(geometry);
  const distance = geometry.rtl ? line.x + line.width - x : x - line.x;
  return distance > drawn + (line.width - drawn) / 2 ? geometry.sourceEnd : offset;
}

/**
 * The boxes covering `[start, end)`, one per line the range touches.
 * A range reaching into the hidden tail lights the ellipsis, which is
 * where that text is on screen.
 */
export function selectionRectsIn(geometry: ParagraphGeometry, start: number, end: number): LayoutBox[] {
  if (geometry.lines.length === 0) {
    return [];
  }
  const from = clamp(start, geometry.start, geometry.end);
  const to = clamp(end, geometry.start, geometry.end);
  const rects =
    to <= from ? [] : selectionRects(geometry.lines, geometry.text, from, to, geometry.measure, geometry.rtl);
  const ellipsis =
    end > geometry.end && start < geometry.sourceEnd && geometry.sourceEnd > geometry.end
      ? ellipsisBox(geometry)
      : undefined;
  if (ellipsis === undefined) {
    return rects;
  }
  // Drawn as one box with the glyphs before it when the range covers
  // them too, so the highlight has no seam at the ellipsis.
  const last = rects.length === 0 ? undefined : rects[rects.length - 1];
  if (last !== undefined && last.y === ellipsis.y) {
    const left = Math.min(last.x, ellipsis.x);
    const right = Math.max(last.x + last.width, ellipsis.x + ellipsis.width);
    rects[rects.length - 1] = { x: left, y: last.y, width: right - left, height: last.height };
  } else {
    rects.push(ellipsis);
  }
  return rects;
}

/**
 * The word around an offset, for a double click. Read from the source,
 * so a word the ellipsis cuts is taken whole, as a browser takes it.
 */
export function wordRangeIn(geometry: ParagraphGeometry, offset: number): { start: number; end: number } {
  const word = visibleWordRange(geometry.source, geometry.hidden, clamp(offset, geometry.start, geometry.sourceEnd));
  return { start: word.start, end: Math.min(word.end, geometry.sourceEnd) };
}

/** The advance of the last line's drawn glyphs, its ellipsis excluded. */
function drawnWidth(geometry: ParagraphGeometry): number {
  const line = geometry.lines[geometry.lines.length - 1];
  const drawn = geometry.text.slice(line.start, geometry.end);
  return drawn.length === line.text.length ? line.width : geometry.measure(drawn, line.start);
}

/** The ellipsis on the last line, or undefined for a clamp that draws none. */
function ellipsisBox(geometry: ParagraphGeometry): LayoutBox | undefined {
  const line = geometry.lines[geometry.lines.length - 1];
  const drawn = drawnWidth(geometry);
  const width = line.width - drawn;
  if (width <= 0) {
    return undefined;
  }
  return { x: geometry.rtl ? line.x : line.x + drawn, y: line.y, width, height: line.height };
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

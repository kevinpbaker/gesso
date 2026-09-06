import type { LayoutBox } from '../layout/LayoutTypes';
import type { TextMeasurer } from '../layout/TextMeasurer';
import { spannedRunsFor } from '../layout/TextMeasurer';
import type { PaintState } from '../rendering/PaintState';
import { placeLines, textMeasureRequest, type TextLinePlacement } from '../rendering/TextRenderer';
import { offsetAtPoint, selectionRects, type RunMeasure } from '../editing/TextGeometry';
import { wordRangeAt } from '../editing/TextBoundaries';

/**
 * A laid-out paragraph, ready to answer the two questions a selection
 * asks of it: which offset is under a point, and which boxes cover a
 * range.
 *
 * This is `EditableLayout` for text nobody types into, and the
 * difference is the reason it is its own thing: an editable never
 * clamps, so every character it holds has a caret position, while a
 * `Text` node may be capped by `maxLines` and ellipsised. Only what is
 * drawn can be selected, so `text` here is the source truncated to the
 * last drawn line — which keeps the geometry helpers, written for the
 * un-clamped case, correct without a clamp-aware branch in each of
 * them.
 */
export interface ParagraphGeometry {
  readonly lines: readonly TextLinePlacement[];
  /** The source text, truncated to what the lines actually draw. */
  readonly text: string;
  /** Offset the drawn text starts at; always 0 today, kept for symmetry with `end`. */
  readonly start: number;
  /** Offset the drawn text ends at: past it there is nothing to select. */
  readonly end: number;
  readonly measure: RunMeasure;
  readonly rtl: boolean;
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
  return {
    lines,
    text: end === text.length ? text : text.slice(0, end),
    start: lines.length === 0 ? 0 : lines[0].start,
    end,
    measure: (run, from) =>
      run.length === 0
        ? 0
        : spanned === undefined || from === undefined
          ? measurer.measureRunWidth(run, request)
          : spanned.width(text, from, from + run.length),
    rtl: state.rtl
  };
}

/** Whether anything in this paragraph can be selected at all. */
export function hasDrawnText(geometry: ParagraphGeometry): boolean {
  return geometry.lines.length > 0 && geometry.end > geometry.start;
}

/** The offset nearest a point, clamped to the drawn text. */
export function offsetAtPointIn(geometry: ParagraphGeometry, x: number, y: number): number {
  if (geometry.lines.length === 0) {
    return 0;
  }
  return offsetAtPoint(geometry.lines, geometry.text, x, y, geometry.measure, geometry.rtl);
}

/** The boxes covering `[start, end)`, one per line the range touches. */
export function selectionRectsIn(geometry: ParagraphGeometry, start: number, end: number): LayoutBox[] {
  const from = clamp(start, geometry.start, geometry.end);
  const to = clamp(end, geometry.start, geometry.end);
  if (geometry.lines.length === 0 || to <= from) {
    return [];
  }
  return selectionRects(geometry.lines, geometry.text, from, to, geometry.measure, geometry.rtl);
}

/** The word around an offset, for a double click. */
export function wordRangeIn(geometry: ParagraphGeometry, offset: number): { start: number; end: number } {
  return wordRangeAt(geometry.text, clamp(offset, geometry.start, geometry.end));
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

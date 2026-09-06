import type {
  FontMetrics,
  ParagraphLayout,
  SpannedRuns,
  TextLine,
  TextLineRun,
  TextMeasureRequest,
  TextRunMeasurer,
  TextWrap
} from './TextMeasurer';
import { spannedRunsFor } from './TextMeasurer';
import { IDEOGRAPHIC_SPACE, segmentParagraph } from './LineBreaks';
import type { TextSegment } from './LineBreaks';

export { DEFAULT_LINE_HEIGHT_FACTOR } from '../properties/UiTextFont';
import { DEFAULT_LINE_HEIGHT_FACTOR } from '../properties/UiTextFont';
export const ELLIPSIS = '…';

/**
 * The width of a stretch of the paragraph.
 *
 * `segment` is always `text.slice(start, end)`. The offsets are what a
 * paragraph with runs measures by, and a paragraph without them
 * ignores; the string is passed as well because the platform measures
 * a string and slicing it twice would be waste.
 */
type Measure = (segment: string, start: number, end: number) => number;

/**
 * How far past the available width a line may reach and still fit.
 *
 * Chrome lays text out in 1/64 px units and snaps each advance to one,
 * so five 16 px ideographs fit an 80 px line exactly. `measureText`
 * answers in floats with the shaper's fixed-point noise in them
 * (16.00003 px per ideograph in one font), and five of those would not
 * fit without this. One layout unit of slack is what Chrome itself has.
 */
const FIT_EPSILON = 1 / 64;

/**
 * Breaks a text into lines and sizes the paragraph.
 *
 * This is the one line-breaking algorithm in the runtime. Measurers
 * supply run widths and font metrics; layout, both renderers and the
 * tests all get their lines from here, so a line can never wrap in
 * one place and not another.
 *
 * Semantics follow CSS where Gesso borrows its names, with
 * `white-space: pre-wrap` as the model for wrapping text: runs of
 * spaces are preserved, `\n` always breaks, and spaces at a break hang.
 *
 *   wrap 'word'  — break after blanks and at the opportunities
 *                  `LineBreaks.ts` knows (hyphens, dashes, zero-width
 *                  spaces); a segment wider than the available width
 *                  overflows on its own line.
 *   wrap 'char'  — `word-break: break-all`: break between any two
 *                  grapheme clusters.
 *   wrap 'none'  — `white-space: nowrap`: only '\n' breaks.
 *
 * Blanks at a break hang: they neither count toward the line width nor
 * start the next line. Blanks at the start of a paragraph are kept, as
 * pre-wrap keeps them, so an indented line stays indented. Widths are
 * accumulated per segment so a paragraph re-laid out at a new width
 * asks the platform only for segments it has not seen; the final width
 * of each line is measured once as a whole.
 *
 * The paragraph width is CSS fit-content: the available width when
 * wrapping occurred, the natural width when it did not, and never
 * narrower than the widest segment. When a segment is wider than the
 * available width the paragraph grows to it, and every line wraps
 * against that grown width rather than the one asked for, because that
 * is the box the lines will be painted in.
 *
 * The first baseline sits half the leading below the line top, plus the
 * ascent, with the half-leading floored to a whole pixel. That floor is
 * what Chrome does (its line layout floors the half-leading before
 * adding it to the ascent), and the text conformance fixtures showed
 * every baseline a fraction of a pixel below Chrome's without it. It is
 * also why DOM text is crisp: with whole-pixel font metrics and a
 * whole-pixel line height, the baseline lands on a pixel boundary.
 *
 * **Runs.** `request.spans` names stretches of the same text with
 * fonts of their own, and everything above changes in one way: a width
 * is asked for by offsets and answered run by run. The text is one
 * string either way, so a line's `start`, a selection, a find match
 * and a caret mean what they always meant, and the algorithm here is
 * the algorithm it was. Each line additionally carries `runs`, the
 * line cut at the run boundaries with each piece's x, measured while
 * the line's own width is measured, so that painting a paragraph with
 * runs asks the platform for nothing.
 */
export function layoutParagraph(request: TextMeasureRequest, runs: TextRunMeasurer): ParagraphLayout {
  const fontSize = request.fontSize;
  const requestedLineHeight =
    request.lineHeight !== undefined && request.lineHeight > 0
      ? request.lineHeight
      : fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
  const spanned = fontSize > 0 ? spannedRunsFor(request, runs) : undefined;
  const box = lineBox(request, runs, spanned, requestedLineHeight, fontSize > 0);
  const lineHeight = box.height;
  const wrap: TextWrap = request.wrap ?? 'word';
  const maxWidth = request.maxWidth !== undefined && request.maxWidth >= 0 ? request.maxWidth : Infinity;
  const text = request.text;
  const measure: Measure =
    spanned === undefined
      ? segment => (segment.length === 0 ? 0 : runs.measureRunWidth(segment, request))
      : (_segment, start, end) => spanned.width(text, start, end);

  // Split into paragraphs and segment each, so the widest segment is
  // known before any line is broken: it is the floor of the box, and
  // the width the lines wrap against.
  const paragraphs: { start: number; text: string; segments: TextSegment[] }[] = [];
  let maxContentWidth = 0;
  let minContentWidth = 0;
  let paragraphStart = 0;
  for (;;) {
    let paragraphEnd = text.indexOf('\n', paragraphStart);
    if (paragraphEnd < 0) {
      paragraphEnd = text.length;
    }
    const paragraph = text.slice(paragraphStart, paragraphEnd);
    const segments = segmentParagraph(paragraph, wrap);
    paragraphs.push({ start: paragraphStart, text: paragraph, segments });
    maxContentWidth = Math.max(maxContentWidth, measure(paragraph, paragraphStart, paragraphEnd));
    for (const segment of segments) {
      minContentWidth = Math.max(
        minContentWidth,
        measure(
          paragraph.slice(segment.start, segment.end),
          paragraphStart + segment.start,
          paragraphStart + segment.end
        )
      );
    }
    if (paragraphEnd >= text.length) {
      break;
    }
    paragraphStart = paragraphEnd + 1;
  }
  const available = Math.max(maxWidth, minContentWidth);

  const lines: TextLine[] = [];
  for (const paragraph of paragraphs) {
    const before = lines.length;
    if (wrap === 'none' || !isFinite(available)) {
      pushLine(text, paragraph.text, paragraph.start, 0, paragraph.text.length, measure, spanned, lines);
    } else {
      breakGreedy(text, paragraph.text, paragraph.start, paragraph.segments, available, measure, spanned, lines);
    }
    if (lines.length === before) {
      // A blank or all-space paragraph still occupies a line.
      lines.push({ start: paragraph.start, end: paragraph.start, text: '', width: 0 });
    }
  }

  if (request.maxLines !== undefined && request.maxLines >= 1 && lines.length > request.maxLines) {
    lines.length = request.maxLines;
    if (request.overflow === 'ellipsis') {
      lines[lines.length - 1] = ellipsize(text, lines[lines.length - 1], maxWidth, measure, spanned);
    }
  } else if (request.overflow === 'ellipsis' && isFinite(maxWidth)) {
    // A line that does not fit — no wrapping, or a segment wider than
    // the box — is ellipsised in place.
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].width > maxWidth) {
        lines[i] = ellipsize(text, lines[i], maxWidth, measure, spanned);
      }
    }
  }

  return {
    lines,
    width: Math.max(minContentWidth, Math.min(maxContentWidth, maxWidth)),
    height: lines.length * lineHeight,
    lineHeight,
    ascent: box.ascent,
    descent: box.descent,
    firstBaseline: box.baseline,
    minContentWidth,
    maxContentWidth
  };
}

/** Metrics for measurers that cannot ask the platform for them. */
export function proportionalFontMetrics(fontSize: number, ascentFactor = 0.8, descentFactor = 0.2): FontMetrics {
  return { ascent: fontSize * ascentFactor, descent: fontSize * descentFactor };
}

// ---------------------------------------------------------------------------
// The line box
// ---------------------------------------------------------------------------

interface LineBox {
  ascent: number;
  descent: number;
  baseline: number;
  height: number;
}

/**
 * Where the baseline sits in a line and how tall the line is.
 *
 * One font is the case CSS makes simple and the one this has always
 * answered: the baseline is the ascent plus the floored half-leading,
 * and the line is exactly the requested line height.
 *
 * Several fonts is the case CSS answers by stacking inline boxes. A
 * run inherits the paragraph's line height as a length, so its own box
 * is that tall whatever its font size, and it is placed with its
 * baseline `ascent + halfLeading` below its top. The line's baseline is
 * therefore the largest of those distances, and the line's height is
 * that plus the largest distance below. With one font the two rules
 * are the same arithmetic, which is why this is not two code paths;
 * with one font it is also not run at all past the first entry.
 *
 * What it does not do is size each line separately. Every line of a
 * paragraph gets the tallest line's box, because `height` is
 * `lines × lineHeight` here and both renderers step by that. A run
 * much larger than the paragraph therefore makes every line as tall as
 * the one it is on, which Chrome does not; the fixture that pins it
 * says so.
 */
function lineBox(
  request: TextMeasureRequest,
  runs: TextRunMeasurer,
  spanned: SpannedRuns | undefined,
  lineHeight: number,
  hasFont: boolean
): LineBox {
  const metrics = hasFont ? runs.fontMetrics(request) : { ascent: 0, descent: 0 };
  if (spanned === undefined) {
    return {
      ascent: metrics.ascent,
      descent: metrics.descent,
      baseline: metrics.ascent + halfLeading(lineHeight, metrics),
      height: lineHeight
    };
  }
  let ascent = metrics.ascent;
  let descent = metrics.descent;
  let above = metrics.ascent + halfLeading(lineHeight, metrics);
  let below = lineHeight - above;
  for (const span of spanned.spans) {
    const runMetrics = runs.fontMetrics(spanned.requestAt(span.start));
    const top = halfLeading(lineHeight, runMetrics);
    ascent = Math.max(ascent, runMetrics.ascent);
    descent = Math.max(descent, runMetrics.descent);
    above = Math.max(above, runMetrics.ascent + top);
    below = Math.max(below, lineHeight - runMetrics.ascent - top);
  }
  return { ascent, descent, baseline: above, height: above + below };
}

/** The space above the ascent, floored as Chrome's line layout floors it. */
function halfLeading(lineHeight: number, metrics: FontMetrics): number {
  return Math.floor((lineHeight - (metrics.ascent + metrics.descent)) / 2);
}

// ---------------------------------------------------------------------------
// Breaking
// ---------------------------------------------------------------------------

/**
 * Greedy first-fit: append segments while they fit, otherwise start a
 * new line with the segment. The first segment on a line always goes
 * on it, so an oversized segment overflows rather than vanishing.
 *
 * Blanks between two segments on one line are counted at their own
 * widths: a space or a tab as one space (a tab stop is a position the
 * renderer does not know; the fixture that pins it says so), an
 * ideographic space as itself. Blanks before the first segment of the
 * paragraph are part of its first line; blanks before the first segment
 * of any later line hang off the line before, as pre-wrap hangs them.
 */
function breakGreedy(
  source: string,
  paragraph: string,
  offset: number,
  segments: readonly TextSegment[],
  available: number,
  measure: Measure,
  spanned: SpannedRuns | undefined,
  out: TextLine[]
): void {
  // One space is one measurement for a paragraph in one font, and one
  // per blank for a paragraph whose runs may space differently.
  const spaceWidth = spanned === undefined ? measure(' ', offset, offset) : 0;
  const blanks = (from: number, to: number): number => {
    let width = 0;
    for (let i = from; i < to; i++) {
      const blank = paragraph.charCodeAt(i) === IDEOGRAPHIC_SPACE ? '　' : ' ';
      if (spanned !== undefined) {
        width += spanned.widthOf(blank, offset + i);
      } else if (blank === ' ') {
        width += spaceWidth;
      } else {
        width += measure(blank, offset + i, offset + i);
      }
    }
    return width;
  };
  let lineStart = -1;
  let lineEnd = -1;
  let lineWidth = 0;
  let firstLine = true;

  for (const segment of segments) {
    const segmentWidth = measure(
      paragraph.slice(segment.start, segment.end),
      offset + segment.start,
      offset + segment.end
    );
    if (lineStart < 0) {
      lineStart = firstLine ? 0 : segment.start;
      lineEnd = segment.end;
      lineWidth = blanks(lineStart, segment.start) + segmentWidth;
    } else {
      const candidate = lineWidth + blanks(lineEnd, segment.start) + segmentWidth;
      if (candidate <= available + FIT_EPSILON) {
        lineEnd = segment.end;
        lineWidth = candidate;
      } else {
        pushLine(source, paragraph, offset, lineStart, lineEnd, measure, spanned, out);
        firstLine = false;
        lineStart = segment.start;
        lineEnd = segment.end;
        lineWidth = segmentWidth;
      }
    }
  }

  if (lineStart >= 0) {
    pushLine(source, paragraph, offset, lineStart, lineEnd, measure, spanned, out);
  }
}

function pushLine(
  source: string,
  paragraph: string,
  offset: number,
  start: number,
  end: number,
  measure: Measure,
  spanned: SpannedRuns | undefined,
  out: TextLine[]
): void {
  const text = paragraph.slice(start, end);
  const from = offset + start;
  const to = offset + end;
  if (spanned === undefined) {
    out.push({ start: from, end: to, text, width: measure(text, from, to) });
    return;
  }
  // Cutting the line measures each piece, and their widths sum to the
  // line's, so the line is not measured a second time as a whole.
  const runs = spanned.cut(source, from, to, 0);
  let width = 0;
  for (const run of runs) {
    width += run.width;
  }
  out.push({ start: from, end: to, text, width, runs });
}

/**
 * Shortens a line until it and an ellipsis fit the available width.
 * Trailing spaces are dropped before the ellipsis is appended.
 *
 * The ellipsis belongs to the run the text it follows ends in, so a
 * clamped line of bold text ends in a bold ellipsis.
 */
function ellipsize(
  source: string,
  line: TextLine,
  maxWidth: number,
  measure: Measure,
  spanned: SpannedRuns | undefined
): TextLine {
  if (!isFinite(maxWidth)) {
    return line;
  }
  let text = line.text;
  for (;;) {
    const trimmed = text.replace(/\s+$/, '');
    const candidate = trimmed + ELLIPSIS;
    const end = line.start + trimmed.length;
    const width =
      spanned === undefined
        ? measure(candidate, line.start, end)
        : measure(trimmed, line.start, end) + spanned.widthOf(ELLIPSIS, Math.max(line.start, end - 1));
    if (width <= maxWidth || trimmed.length === 0) {
      return {
        start: line.start,
        end,
        text: candidate,
        width,
        runs: spanned === undefined ? undefined : ellipsisRuns(source, spanned, line.start, end, width)
      };
    }
    text = trimmed.slice(0, previousCharacterStart(trimmed, trimmed.length));
  }
}

/** The clamped line's runs, with the ellipsis on the end of the last. */
function ellipsisRuns(
  source: string,
  spanned: SpannedRuns,
  start: number,
  end: number,
  width: number
): readonly TextLineRun[] {
  const runs = spanned.cut(source, start, end, 0);
  if (runs.length === 0) {
    return [{ span: -1, start, end, text: ELLIPSIS, x: 0, width }];
  }
  const last = runs[runs.length - 1];
  runs[runs.length - 1] = {
    span: last.span,
    start: last.start,
    end: last.end,
    text: last.text + ELLIPSIS,
    x: last.x,
    width: width - last.x
  };
  return runs;
}

function previousCharacterStart(text: string, index: number): number {
  const code = text.charCodeAt(index - 1);
  if (code >= 0xdc00 && code <= 0xdfff && index - 2 >= 0) {
    return index - 2;
  }
  return index - 1;
}

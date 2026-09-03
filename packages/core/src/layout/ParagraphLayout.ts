import type {
  FontMetrics,
  ParagraphLayout,
  TextLine,
  TextMeasureRequest,
  TextRunMeasurer,
  TextWrap
} from './TextMeasurer';
import { IDEOGRAPHIC_SPACE, segmentParagraph } from './LineBreaks';
import type { TextSegment } from './LineBreaks';

export { DEFAULT_LINE_HEIGHT_FACTOR } from '../properties/UiTextFont';
import { DEFAULT_LINE_HEIGHT_FACTOR } from '../properties/UiTextFont';
export const ELLIPSIS = '…';

type Measure = (segment: string) => number;

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
 */
export function layoutParagraph(request: TextMeasureRequest, runs: TextRunMeasurer): ParagraphLayout {
  const fontSize = request.fontSize;
  const lineHeight =
    request.lineHeight !== undefined && request.lineHeight > 0
      ? request.lineHeight
      : fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
  const metrics = fontSize > 0 ? runs.fontMetrics(request) : { ascent: 0, descent: 0 };
  const wrap: TextWrap = request.wrap ?? 'word';
  const maxWidth = request.maxWidth !== undefined && request.maxWidth >= 0 ? request.maxWidth : Infinity;
  const text = request.text;
  const measure: Measure = segment => (segment.length === 0 ? 0 : runs.measureRunWidth(segment, request));

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
    maxContentWidth = Math.max(maxContentWidth, measure(paragraph));
    for (const segment of segments) {
      minContentWidth = Math.max(minContentWidth, measure(paragraph.slice(segment.start, segment.end)));
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
      lines.push({
        start: paragraph.start,
        end: paragraph.start + paragraph.text.length,
        text: paragraph.text,
        width: measure(paragraph.text)
      });
    } else {
      breakGreedy(paragraph.text, paragraph.start, paragraph.segments, available, measure, lines);
    }
    if (lines.length === before) {
      // A blank or all-space paragraph still occupies a line.
      lines.push({ start: paragraph.start, end: paragraph.start, text: '', width: 0 });
    }
  }

  if (request.maxLines !== undefined && request.maxLines >= 1 && lines.length > request.maxLines) {
    lines.length = request.maxLines;
    if (request.overflow === 'ellipsis') {
      lines[lines.length - 1] = ellipsize(lines[lines.length - 1], maxWidth, measure);
    }
  } else if (request.overflow === 'ellipsis' && isFinite(maxWidth)) {
    // A line that does not fit — no wrapping, or a segment wider than
    // the box — is ellipsised in place.
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].width > maxWidth) {
        lines[i] = ellipsize(lines[i], maxWidth, measure);
      }
    }
  }

  return {
    lines,
    width: Math.max(minContentWidth, Math.min(maxContentWidth, maxWidth)),
    height: lines.length * lineHeight,
    lineHeight,
    ascent: metrics.ascent,
    descent: metrics.descent,
    firstBaseline: metrics.ascent + Math.floor((lineHeight - (metrics.ascent + metrics.descent)) / 2),
    minContentWidth,
    maxContentWidth
  };
}

/** Metrics for measurers that cannot ask the platform for them. */
export function proportionalFontMetrics(fontSize: number, ascentFactor = 0.8, descentFactor = 0.2): FontMetrics {
  return { ascent: fontSize * ascentFactor, descent: fontSize * descentFactor };
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
  paragraph: string,
  offset: number,
  segments: readonly TextSegment[],
  available: number,
  measure: Measure,
  out: TextLine[]
): void {
  const spaceWidth = measure(' ');
  const blanks = (from: number, to: number): number => {
    let width = 0;
    for (let i = from; i < to; i++) {
      width += paragraph.charCodeAt(i) === IDEOGRAPHIC_SPACE ? measure('\u3000') : spaceWidth;
    }
    return width;
  };
  let lineStart = -1;
  let lineEnd = -1;
  let lineWidth = 0;
  let firstLine = true;

  for (const segment of segments) {
    const segmentWidth = measure(paragraph.slice(segment.start, segment.end));
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
        pushLine(paragraph, offset, lineStart, lineEnd, measure, out);
        firstLine = false;
        lineStart = segment.start;
        lineEnd = segment.end;
        lineWidth = segmentWidth;
      }
    }
  }

  if (lineStart >= 0) {
    pushLine(paragraph, offset, lineStart, lineEnd, measure, out);
  }
}

function pushLine(
  paragraph: string,
  offset: number,
  start: number,
  end: number,
  measure: Measure,
  out: TextLine[]
): void {
  const text = paragraph.slice(start, end);
  out.push({ start: offset + start, end: offset + end, text, width: measure(text) });
}

/**
 * Shortens a line until it and an ellipsis fit the available width.
 * Trailing spaces are dropped before the ellipsis is appended.
 */
function ellipsize(line: TextLine, maxWidth: number, measure: Measure): TextLine {
  if (!isFinite(maxWidth)) {
    return line;
  }
  let text = line.text;
  for (;;) {
    const trimmed = text.replace(/\s+$/, '');
    const candidate = trimmed + ELLIPSIS;
    const width = measure(candidate);
    if (width <= maxWidth || trimmed.length === 0) {
      return { start: line.start, end: line.start + trimmed.length, text: candidate, width };
    }
    text = trimmed.slice(0, previousCharacterStart(trimmed, trimmed.length));
  }
}

function previousCharacterStart(text: string, index: number): number {
  const code = text.charCodeAt(index - 1);
  if (code >= 0xdc00 && code <= 0xdfff && index - 2 >= 0) {
    return index - 2;
  }
  return index - 1;
}

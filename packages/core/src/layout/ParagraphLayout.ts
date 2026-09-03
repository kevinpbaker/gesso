import type {
  FontMetrics,
  ParagraphLayout,
  TextLine,
  TextMeasureRequest,
  TextRunMeasurer,
  TextWrap
} from './TextMeasurer';

export { DEFAULT_LINE_HEIGHT_FACTOR } from '../properties/UiTextFont';
import { DEFAULT_LINE_HEIGHT_FACTOR } from '../properties/UiTextFont';
export const ELLIPSIS = '…';

type Measure = (segment: string) => number;

/**
 * Breaks a text into lines and sizes the paragraph.
 *
 * This is the one line-breaking algorithm in the runtime. Measurers
 * supply run widths and font metrics; layout, both renderers and the
 * tests all get their lines from here, so a line can never wrap in
 * one place and not another.
 *
 * Semantics follow CSS where Gesso borrows its names:
 *
 *   wrap 'word'  — `white-space: normal`: break at spaces; a word wider
 *                  than the available width overflows on its own line.
 *   wrap 'char'  — `word-break: break-all`: break between any two
 *                  characters.
 *   wrap 'none'  — `white-space: nowrap`: only '\n' breaks.
 *
 * Spaces at a break hang: they neither count toward the line width
 * nor start the next line. Widths are accumulated per segment (word
 * or character) so a paragraph re-laid out at a new width asks the
 * platform only for segments it has not seen; the final width of each
 * line is measured once as a whole.
 *
 * The paragraph width is CSS fit-content: the available width when
 * wrapping occurred, the natural width when it did not, and never
 * narrower than the widest unbreakable segment.
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

  const lines: TextLine[] = [];
  let maxContentWidth = 0;
  let minContentWidth = 0;

  let paragraphStart = 0;
  for (;;) {
    let paragraphEnd = text.indexOf('\n', paragraphStart);
    if (paragraphEnd < 0) {
      paragraphEnd = text.length;
    }
    const paragraph = text.slice(paragraphStart, paragraphEnd);

    maxContentWidth = Math.max(maxContentWidth, measure(paragraph));
    minContentWidth = Math.max(minContentWidth, minContentOf(paragraph, wrap, measure));

    const before = lines.length;
    if (wrap === 'none' || !isFinite(maxWidth)) {
      lines.push({ start: paragraphStart, end: paragraphEnd, text: paragraph, width: measure(paragraph) });
    } else {
      breakGreedy(paragraph, paragraphStart, maxWidth, measure, wrap === 'char' ? characterEnd : wordEnd, lines);
    }
    if (lines.length === before) {
      // A blank or all-space paragraph still occupies a line.
      lines.push({ start: paragraphStart, end: paragraphStart, text: '', width: 0 });
    }

    if (paragraphEnd >= text.length) {
      break;
    }
    paragraphStart = paragraphEnd + 1;
  }

  if (request.maxLines !== undefined && request.maxLines >= 1 && lines.length > request.maxLines) {
    lines.length = request.maxLines;
    if (request.overflow === 'ellipsis') {
      lines[lines.length - 1] = ellipsize(lines[lines.length - 1], maxWidth, measure);
    }
  } else if (request.overflow === 'ellipsis' && isFinite(maxWidth)) {
    // A line that does not fit — no wrapping, or a word wider than the
    // box — is ellipsised in place.
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

/** Returns the end of the segment starting at `from` (never a space). */
type SegmentEnd = (paragraph: string, from: number) => number;

const wordEnd: SegmentEnd = (paragraph, from) => {
  let end = from;
  while (end < paragraph.length && !isSpace(paragraph[end])) {
    end++;
  }
  return end;
};

const characterEnd: SegmentEnd = (paragraph, from) => {
  const code = paragraph.charCodeAt(from);
  // Keep surrogate pairs together so an emoji never splits across lines.
  if (code >= 0xd800 && code <= 0xdbff && from + 1 < paragraph.length) {
    return from + 2;
  }
  return from + 1;
};

/**
 * Greedy first-fit: append segments while they fit, otherwise start a
 * new line with the segment. The first segment on a line always goes
 * on it, so an oversized segment overflows rather than vanishing.
 */
function breakGreedy(
  paragraph: string,
  offset: number,
  maxWidth: number,
  measure: Measure,
  segmentEnd: SegmentEnd,
  out: TextLine[]
): void {
  const length = paragraph.length;
  const spaceWidth = measure(' ');
  let lineStart = -1;
  let lineEnd = -1;
  let lineWidth = 0;
  let position = 0;

  while (position < length) {
    let segmentStart = position;
    while (segmentStart < length && isSpace(paragraph[segmentStart])) {
      segmentStart++;
    }
    if (segmentStart >= length) {
      break;
    }
    const end = segmentEnd(paragraph, segmentStart);
    const segmentWidth = measure(paragraph.slice(segmentStart, end));

    if (lineStart < 0) {
      lineStart = segmentStart;
      lineEnd = end;
      lineWidth = segmentWidth;
    } else {
      const candidate = lineWidth + (segmentStart - lineEnd) * spaceWidth + segmentWidth;
      if (candidate <= maxWidth) {
        lineEnd = end;
        lineWidth = candidate;
      } else {
        pushLine(paragraph, offset, lineStart, lineEnd, measure, out);
        lineStart = segmentStart;
        lineEnd = end;
        lineWidth = segmentWidth;
      }
    }
    position = end;
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
 * The widest unbreakable segment: a word when breaking at spaces, one
 * character when breaking anywhere, the whole paragraph otherwise.
 */
function minContentOf(paragraph: string, wrap: TextWrap, measure: Measure): number {
  if (wrap === 'none') {
    return measure(paragraph);
  }
  const segmentEnd = wrap === 'char' ? characterEnd : wordEnd;
  let widest = 0;
  let position = 0;
  while (position < paragraph.length) {
    if (isSpace(paragraph[position])) {
      position++;
      continue;
    }
    const end = segmentEnd(paragraph, position);
    widest = Math.max(widest, measure(paragraph.slice(position, end)));
    position = end;
  }
  return widest;
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

function isSpace(character: string): boolean {
  return character === ' ' || character === '\t';
}

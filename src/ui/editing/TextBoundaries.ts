/**
 * Boundaries in a text: graphemes, words and lines.
 *
 * Offsets are UTF-16 code unit indices, as everywhere else in the
 * runtime, but a caret never lands inside a grapheme: an emoji, a
 * flag or a letter with combining marks moves and deletes as one.
 * `Intl.Segmenter` does the segmentation where it exists (every
 * current engine); the fallback keeps surrogate pairs together and
 * treats letters, digits and underscore as word characters.
 */

interface Segmenter {
  segment(text: string): {
    containing(index: number): { index: number; segment: string; isWordLike?: boolean } | undefined;
  };
}

const graphemes: Segmenter | null = createSegmenter('grapheme');
const words: Segmenter | null = createSegmenter('word');

function createSegmenter(granularity: 'grapheme' | 'word'): Segmenter | null {
  const intl = Intl as unknown as {
    Segmenter?: new (locale: undefined, options: { granularity: string }) => Segmenter;
  };
  if (typeof intl.Segmenter !== 'function') {
    return null;
  }
  try {
    return new intl.Segmenter(undefined, { granularity });
  } catch {
    return null;
  }
}

/** The end of the grapheme that starts at `index`; `text.length` at the end. */
export function nextGraphemeEnd(text: string, index: number): number {
  if (index >= text.length) {
    return text.length;
  }
  if (graphemes !== null) {
    const segment = graphemes.segment(text).containing(index);
    if (segment !== undefined) {
      return segment.index + segment.segment.length;
    }
  }
  const code = text.charCodeAt(index);
  if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
    return index + 2;
  }
  return index + 1;
}

/** The start of the grapheme that ends at `index`; 0 at the start. */
export function previousGraphemeStart(text: string, index: number): number {
  if (index <= 0) {
    return 0;
  }
  if (graphemes !== null) {
    const segment = graphemes.segment(text).containing(index - 1);
    if (segment !== undefined) {
      return segment.index;
    }
  }
  const code = text.charCodeAt(index - 1);
  if (code >= 0xdc00 && code <= 0xdfff && index - 2 >= 0) {
    return index - 2;
  }
  return index - 1;
}

/** Every caret position in `text`: 0, each grapheme boundary, `text.length`. */
export function graphemeBoundaries(text: string): number[] {
  const boundaries = [0];
  let index = 0;
  while (index < text.length) {
    index = nextGraphemeEnd(text, index);
    boundaries.push(index);
  }
  return boundaries;
}

/**
 * Where a word-wise move to the right stops: past any spaces and
 * punctuation, at the end of the next word. A newline is a boundary
 * of its own so word moves never skip a line.
 */
export function nextWordEnd(text: string, index: number): number {
  const length = text.length;
  if (index >= length) {
    return length;
  }
  if (text[index] === '\n') {
    return index + 1;
  }
  let position = index;
  while (position < length && !isWordCharAt(text, position)) {
    if (text[position] === '\n') {
      return position;
    }
    position = nextGraphemeEnd(text, position);
  }
  if (position >= length) {
    return length;
  }
  return wordEndAt(text, position);
}

/**
 * Where a word-wise move to the left stops: back over spaces and
 * punctuation, to the start of the previous word.
 */
export function previousWordStart(text: string, index: number): number {
  if (index <= 0) {
    return 0;
  }
  if (text[index - 1] === '\n') {
    return index - 1;
  }
  let position = index;
  while (position > 0 && !isWordCharAt(text, position - 1)) {
    if (text[position - 1] === '\n') {
      return position;
    }
    position = previousGraphemeStart(text, position);
  }
  if (position <= 0) {
    return 0;
  }
  return wordStartAt(text, position - 1);
}

/**
 * The word under `index`, for a double-click: a run of word
 * characters, else the run of whatever else is there (spaces,
 * punctuation), never crossing a newline.
 */
export function wordRangeAt(text: string, index: number): { start: number; end: number } {
  if (text.length === 0) {
    return { start: 0, end: 0 };
  }
  const at = Math.min(index, text.length - 1);
  if (text[at] === '\n') {
    return { start: at, end: at };
  }
  if (words !== null) {
    const segment = words.segment(text).containing(at);
    if (segment !== undefined) {
      return { start: segment.index, end: segment.index + segment.segment.length };
    }
  }
  const wordLike = isWordCharAt(text, at);
  let start = at;
  while (start > 0 && text[start - 1] !== '\n' && isWordCharAt(text, start - 1) === wordLike) {
    start = previousGraphemeStart(text, start);
  }
  let end = at;
  while (end < text.length && text[end] !== '\n' && isWordCharAt(text, end) === wordLike) {
    end = nextGraphemeEnd(text, end);
  }
  return { start, end };
}

/** The offset just after the previous newline, or 0. */
export function lineStartAt(text: string, index: number): number {
  const newline = text.lastIndexOf('\n', Math.max(0, index - 1));
  return newline < 0 ? 0 : newline + 1;
}

/** The offset of the next newline, or `text.length`. */
export function lineEndAt(text: string, index: number): number {
  const newline = text.indexOf('\n', index);
  return newline < 0 ? text.length : newline;
}

function wordEndAt(text: string, index: number): number {
  if (words !== null) {
    const segment = words.segment(text).containing(index);
    if (segment !== undefined && segment.isWordLike) {
      return segment.index + segment.segment.length;
    }
  }
  let end = index;
  while (end < text.length && isWordCharAt(text, end)) {
    end = nextGraphemeEnd(text, end);
  }
  return end;
}

function wordStartAt(text: string, index: number): number {
  if (words !== null) {
    const segment = words.segment(text).containing(index);
    if (segment !== undefined && segment.isWordLike) {
      return segment.index;
    }
  }
  let start = index;
  while (start > 0 && isWordCharAt(text, start - 1)) {
    start = previousGraphemeStart(text, start);
  }
  return start;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function isWordCharAt(text: string, index: number): boolean {
  if (words !== null) {
    const segment = words.segment(text).containing(index);
    return segment?.isWordLike === true;
  }
  const code = text.charCodeAt(index);
  const character =
    code >= 0xd800 && code <= 0xdbff && index + 1 < text.length ? text.slice(index, index + 2) : text[index];
  return WORD_CHAR.test(character);
}

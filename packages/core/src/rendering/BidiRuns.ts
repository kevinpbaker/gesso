/**
 * The visual order of a line's words.
 *
 * Canvas2D never needs this: `fillText` takes a whole line and Chrome
 * reorders it. The WebGPU glyph atlas draws a line a cell at a time,
 * and for a line holding Arabic or Hebrew that means two things the
 * per-cluster path cannot do. A cursive word has to be rasterised whole,
 * or every letter draws in its isolated form; and the words have to be
 * placed in visual order, or an Arabic sentence reads backwards and a
 * number inside it lands on the wrong side.
 *
 * This is the Unicode Bidirectional Algorithm at the granularity of
 * words rather than characters. A line is split into tokens, maximal
 * runs of blanks and of non-blanks, each token takes one bidi class
 * from its first strong character (or from its digits, or none), and
 * the algorithm's weak, neutral, implicit and reordering rules run over
 * the tokens (W2, W7, N1, N2, I1, I2, L1, L2). Inside a token, Chrome
 * shapes and orders the characters when the token is rasterised, so a
 * word that mixes classes internally, rare outside URLs, comes out as
 * Chrome would draw it alone.
 *
 * Not done, and stated: bracket pairing (N0), explicit embeddings and
 * isolates (the U+202A to U+2069 controls are treated as neutral),
 * and levels above two. The text conformance harness records Chrome's
 * per-cluster visual positions for every right-to-left fixture and
 * `WebGPUGlyphShaper.bidi.spec.ts` asserts these tokens land on them.
 */

export interface VisualToken {
  /** Offsets into the line's text, in logical order. */
  start: number;
  end: number;
  text: string;
  blank: boolean;
}

/** Whether a line needs visual ordering at all: a right-to-left paragraph, or a strong right-to-left character in it. */
export function needsVisualOrder(text: string, rtl: boolean): boolean {
  if (rtl) {
    return true;
  }
  for (const character of text) {
    const kind = strongKind(character.codePointAt(0)!);
    if (kind === 'R' || kind === 'AL') {
      return true;
    }
  }
  return false;
}

/** The line's tokens in the order they are drawn from left to right. */
export function visualOrder(text: string, rtl: boolean): VisualToken[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return tokens;
  }
  const paragraph = rtl ? 1 : 0;
  const classes = tokens.map(token => (token.blank ? 'WS' : classify(token.text)));

  // W2: a European number after an Arabic letter is an Arabic number.
  // W7: a European number after a Latin letter (or at the start of a
  // left-to-right paragraph) is a letter.
  let lastStrong: 'L' | 'R' | 'AL' | null = paragraph === 0 ? 'L' : 'R';
  for (let i = 0; i < classes.length; i++) {
    const kind = classes[i];
    if (kind === 'L' || kind === 'R' || kind === 'AL') {
      lastStrong = kind;
    } else if (kind === 'EN') {
      if (lastStrong === 'AL') {
        classes[i] = 'AN';
      } else if (lastStrong === 'L') {
        classes[i] = 'L';
      }
    }
  }

  // N1 and N2: a run of neutrals between two strong characters of the
  // same direction takes it (numbers count as right-to-left); any other
  // neutral run takes the paragraph's direction.
  const directions: ('L' | 'R')[] = classes.map(kind => (kind === 'L' ? 'L' : 'R'));
  let i = 0;
  while (i < classes.length) {
    if (!isNeutral(classes[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < classes.length && isNeutral(classes[j])) {
      j++;
    }
    const before = i === 0 ? null : directions[i - 1];
    const after = j === classes.length ? null : directionOfStrong(classes[j]);
    const resolved: 'L' | 'R' = before !== null && before === after ? before : paragraph === 0 ? 'L' : 'R';
    for (let k = i; k < j; k++) {
      directions[k] = resolved;
    }
    i = j;
  }

  // I1 and I2: embedding levels from the resolved classes.
  const levels = classes.map((kind, index) => {
    if (kind === 'EN' || kind === 'AN') {
      return 2;
    }
    if (kind === 'R' || kind === 'AL') {
      return 1;
    }
    if (kind === 'L') {
      return paragraph === 0 ? 0 : 2;
    }
    return directions[index] === 'L' ? (paragraph === 0 ? 0 : 2) : 1;
  });

  // L1: blanks at the end of the line take the paragraph level.
  for (let k = levels.length - 1; k >= 0 && tokens[k].blank; k--) {
    levels[k] = paragraph;
  }

  // L2: from the highest level down to the lowest odd level, reverse
  // every run of tokens at that level or above.
  const highest = Math.max(...levels);
  const lowestOdd = Math.min(...levels.map(level => (level % 2 === 1 ? level : Infinity)));
  const order = tokens.map((_, index) => index);
  for (let level = highest; level >= Math.max(1, lowestOdd); level--) {
    let k = 0;
    while (k < order.length) {
      if (levels[order[k]] < level) {
        k++;
        continue;
      }
      let end = k;
      while (end < order.length && levels[order[end]] >= level) {
        end++;
      }
      reverse(order, k, end);
      k = end;
    }
  }
  return order.map(index => tokens[index]);
}

type BidiClass = 'L' | 'R' | 'AL' | 'EN' | 'AN' | 'ON' | 'WS';

function isNeutral(kind: BidiClass): boolean {
  return kind === 'ON' || kind === 'WS';
}

function directionOfStrong(kind: BidiClass): 'L' | 'R' | null {
  return kind === 'L' ? 'L' : kind === 'R' || kind === 'AL' || kind === 'EN' || kind === 'AN' ? 'R' : null;
}

/** A token's class: its first strong character's, else its digits', else neutral. */
function classify(text: string): BidiClass {
  let digits: 'EN' | 'AN' | null = null;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    const strong = strongKind(code);
    if (strong !== null) {
      return strong;
    }
    if (code >= 0x0660 && code <= 0x0669) {
      digits = 'AN';
    } else if (digits === null && DIGIT.test(character)) {
      digits = 'EN';
    }
  }
  return digits ?? 'ON';
}

const DIGIT = /^\p{Nd}$/u;
const LETTER = /^\p{L}$/u;

/** L, R or AL for a strong character; null for anything else. */
function strongKind(code: number): 'L' | 'R' | 'AL' | null {
  if (
    (code >= 0x0600 && code <= 0x06ff && !(code >= 0x0660 && code <= 0x0669) && !(code >= 0x06f0 && code <= 0x06f9)) ||
    (code >= 0x0750 && code <= 0x077f) ||
    (code >= 0x0870 && code <= 0x08ff) ||
    (code >= 0x0700 && code <= 0x074f) || // Syriac
    (code >= 0x0780 && code <= 0x07bf) || // Thaana
    (code >= 0xfb50 && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfeff)
  ) {
    return isMarkOrPunctuation(code) ? null : 'AL';
  }
  if (
    (code >= 0x0590 && code <= 0x05ff) || // Hebrew
    (code >= 0x07c0 && code <= 0x07ff) || // NKo
    (code >= 0xfb1d && code <= 0xfb4f)
  ) {
    return isMarkOrPunctuation(code) ? null : 'R';
  }
  return LETTER.test(String.fromCodePoint(code)) ? 'L' : null;
}

/** Combining marks and punctuation inside a right-to-left block are not strong. */
function isMarkOrPunctuation(code: number): boolean {
  const character = String.fromCodePoint(code);
  return !LETTER.test(character);
}

function tokenize(text: string): VisualToken[] {
  const tokens: VisualToken[] = [];
  let start = 0;
  while (start < text.length) {
    const blank = isBlankCode(text.charCodeAt(start));
    let end = start + 1;
    while (end < text.length && isBlankCode(text.charCodeAt(end)) === blank) {
      end++;
    }
    tokens.push({ start, end, text: text.slice(start, end), blank });
    start = end;
  }
  return tokens;
}

function isBlankCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x3000 || code === 0xa0;
}

function reverse(order: number[], from: number, to: number): void {
  for (let a = from, b = to - 1; a < b; a++, b--) {
    const swap = order[a];
    order[a] = order[b];
    order[b] = swap;
  }
}

import { graphemeBoundaries } from '../editing/TextBoundaries';
import type { TextWrap } from './TextMeasurer';

/**
 * Where a paragraph may break, as segments that must stay whole.
 *
 * A segment is a run of text with no break opportunity inside it and
 * none of the blanks (spaces, tabs) that separate segments: the
 * paragraph is its segments with blanks between them, and a line ends
 * at a segment's end. Blanks at a break hang, so they belong to no
 * segment; a hyphen at a break does not hang, so it ends its segment
 * and counts toward the line.
 *
 * The rules are the part of UAX #14 that Latin text meets, checked
 * against Chrome by the text conformance fixtures
 * (`textConformance/cases.ts`, the `wrap/` group):
 *
 *   - a break is allowed after a blank (LB18);
 *   - after a hyphen-minus, a hyphen, a figure dash or an en dash
 *     (classes HY and BA), except before a digit (LB25), before
 *     closing punctuation (LB13) or before another dash (LB21);
 *   - before and after an em dash (class B2), except between two of
 *     them (LB17) or after an opening bracket (LB14);
 *   - after a zero-width space (LB8);
 *   - and never inside a grapheme cluster (LB9), so a base and its
 *     combining marks, or a surrogate pair, are one unit.
 *
 * A non-breaking space and a non-breaking hyphen (class GL) are ordinary
 * characters here and glue their neighbours. A soft hyphen is not a
 * break opportunity yet: taking it means drawing a hyphen that is not in
 * the text, which is hyphenation, and the fixture that pins it says so.
 *
 * `wrap: 'char'` allows a break between any two clusters; `wrap: 'none'`
 * makes the whole paragraph one segment.
 */
export interface TextSegment {
  start: number;
  end: number;
}

export function segmentParagraph(paragraph: string, wrap: TextWrap): TextSegment[] {
  const length = paragraph.length;
  if (length === 0) {
    return [];
  }
  if (wrap === 'none') {
    return [{ start: 0, end: length }];
  }
  const boundaries = clusterBoundaries(paragraph);
  const segments: TextSegment[] = [];
  let i = 0;
  while (i < boundaries.length - 1) {
    // Skip the blanks before a segment.
    while (i < boundaries.length - 1 && isBlank(paragraph.charCodeAt(boundaries[i]))) {
      i++;
    }
    if (i >= boundaries.length - 1) {
      break;
    }
    const start = boundaries[i];
    let end = boundaries[i + 1];
    i++;
    while (i < boundaries.length - 1) {
      const next = paragraph.codePointAt(boundaries[i])!;
      if (isBlank(next) || wrap === 'char' || breaksBetween(paragraph.codePointAt(boundaries[i - 1])!, next)) {
        break;
      }
      end = boundaries[i + 1];
      i++;
    }
    segments.push({ start, end });
  }
  return segments;
}

/** Spaces and tabs separate segments and hang at a break; nothing else does. */
export function isBlank(code: number): boolean {
  return code === 0x20 || code === 0x09;
}

/**
 * Whether a line may break between two adjacent clusters that are not
 * blanks, given the code point each starts with.
 */
function breaksBetween(before: number, after: number): boolean {
  if (before === ZERO_WIDTH_SPACE) {
    return true;
  }
  if (isDash(before)) {
    if (isDash(after) || isClosing(after)) {
      return false;
    }
    if (before === HYPHEN_MINUS && isDigit(after)) {
      return false;
    }
    return true;
  }
  if (after === EM_DASH) {
    return !isOpening(before);
  }
  return false;
}

const HYPHEN_MINUS = 0x2d;
const ZERO_WIDTH_SPACE = 0x200b;
const EM_DASH = 0x2014;

/** HY, the BA dashes, and B2. U+2011 NON-BREAKING HYPHEN is GL and absent on purpose. */
function isDash(code: number): boolean {
  return code === HYPHEN_MINUS || code === 0x2010 || code === 0x2012 || code === 0x2013 || code === EM_DASH;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

/** Closing punctuation a line never starts with: CL, CP, EX, IS, SY and IN. */
function isClosing(code: number): boolean {
  switch (code) {
    case 0x29: // )
    case 0x5d: // ]
    case 0x7d: // }
    case 0x2c: // ,
    case 0x2e: // .
    case 0x21: // !
    case 0x3f: // ?
    case 0x3b: // ;
    case 0x3a: // :
    case 0x2f: // /
    case 0xbb: // »
    case 0x2019: // ’
    case 0x201d: // ”
    case 0x2026: // …
      return true;
    default:
      return false;
  }
}

/** Opening punctuation a line never ends with. */
function isOpening(code: number): boolean {
  switch (code) {
    case 0x28: // (
    case 0x5b: // [
    case 0x7b: // {
    case 0xab: // «
    case 0x2018: // ‘
    case 0x201c: // “
      return true;
    default:
      return false;
  }
}

/**
 * Grapheme cluster boundaries, with a fast path for ASCII, where every
 * code unit is a cluster and the segmenter would only cost time.
 */
function clusterBoundaries(paragraph: string): number[] {
  if (isAscii(paragraph)) {
    return Array.from({ length: paragraph.length + 1 }, (_, i) => i);
  }
  return graphemeBoundaries(paragraph);
}

function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) {
      return false;
    }
  }
  return true;
}

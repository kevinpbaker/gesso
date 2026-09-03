import { graphemeBoundaries, wordBoundaries } from '../editing/TextBoundaries';
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
 *   - after closing punctuation (LB31), except after a comma, full
 *     stop, colon, semicolon or closing parenthesis when a letter or
 *     digit follows (LB25, LB29, LB30), and never after a slash;
 *   - never next to a quotation mark (LB19) or a no-break space,
 *     non-breaking hyphen or word joiner (LB12);
 *   - before or after an ideograph, kana or Hangul syllable (class ID,
 *     and CJ treated as ID, which is what Chrome does outside
 *     `line-break: strict`), except before closing punctuation, a
 *     middle dot or leaders (LB13, LB16, LB22), after an opening bracket
 *     (LB14), between a currency prefix and the ideograph after it
 *     (LB23a) or between an ideograph and a percent sign (LB24);
 *   - between two words of a script that writes without spaces (Thai,
 *     Lao, Khmer, Myanmar; class SA), where the words are the ones
 *     `Intl.Segmenter` finds, which is the browser's own dictionary and
 *     therefore Chrome's (LB1 resolves SA by dictionary);
 *   - and never inside a grapheme cluster (LB9), so a base and its
 *     combining marks, or a surrogate pair, are one unit.
 *
 * An ideographic space (U+3000) is a blank here: it separates segments
 * and hangs at a break, as Chrome hangs it, but it is a one-em glyph
 * between two segments on a line, which `ParagraphLayout` measures.
 *
 * A soft hyphen is not a
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
  const dictionary = hasComplexContext(paragraph) ? new Set(wordBoundaries(paragraph)) : null;
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
      const previous = paragraph.codePointAt(boundaries[i - 1])!;
      if (
        isBlank(next) ||
        wrap === 'char' ||
        breaksBetween(previous, next) ||
        (dictionary !== null && dictionary.has(boundaries[i]) && isComplexContext(previous) && isComplexContext(next))
      ) {
        break;
      }
      end = boundaries[i + 1];
      i++;
    }
    segments.push({ start, end });
  }
  return segments;
}

/** Spaces, tabs and ideographic spaces separate segments and hang at a break; nothing else does. */
export function isBlank(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === IDEOGRAPHIC_SPACE;
}

export const IDEOGRAPHIC_SPACE = 0x3000;

/**
 * Whether a line may break between two adjacent clusters that are not
 * blanks, given the code point each starts with. UAX #14's shape: a
 * break is allowed everywhere (LB31) except where a rule forbids it,
 * and the rules that keep letters, digits and their prefixes together
 * are what make a Latin word one segment.
 */
function breaksBetween(beforeCode: number, afterCode: number): boolean {
  const before = classOf(beforeCode);
  const after = classOf(afterCode);
  if (before === 'ZW') {
    return true; // LB8
  }
  if (after === 'ZW' || before === 'GL' || after === 'GL') {
    return false; // LB7, LB12
  }
  if (after === 'CL' || after === 'CP' || after === 'EX' || after === 'IS' || after === 'SY' || after === 'NS') {
    return false; // LB13, LB16
  }
  if (before === 'OP' || before === 'QU' || after === 'QU') {
    return false; // LB14, LB19
  }
  if (after === 'HY' || after === 'BA') {
    return false; // LB21
  }
  if (before === 'HY' || before === 'BA') {
    if (after === 'B2') {
      return false;
    }
    return !(before === 'HY' && after === 'NU'); // LB25
  }
  if (before === 'B2') {
    return after !== 'B2'; // LB17
  }
  if (after === 'B2') {
    return true;
  }
  if (before === 'SY') {
    return false; // Chrome does not break after a slash; the fixture says so.
  }
  if (before === 'IS' || before === 'CP') {
    return after !== 'AL' && after !== 'NU'; // LB29, LB25, LB30
  }
  if (before === 'CL' || before === 'EX' || before === 'NS') {
    return true; // LB31
  }
  if (before === 'ID') {
    return after !== 'PO'; // LB23a
  }
  if (after === 'ID') {
    return before !== 'PR'; // LB23a
  }
  return false; // LB23, LB24, LB25, LB28: letters, digits, prefixes and postfixes stick
}

type BreakClass =
  | 'AL'
  | 'NU'
  | 'ID'
  | 'OP'
  | 'CL'
  | 'CP'
  | 'IS'
  | 'EX'
  | 'NS'
  | 'SY'
  | 'QU'
  | 'GL'
  | 'PR'
  | 'PO'
  | 'HY'
  | 'BA'
  | 'B2'
  | 'ZW';

/** The UAX #14 class of a code point, as far as these rules tell them apart; AL for everything else. */
function classOf(code: number): BreakClass {
  if (code >= 0x30 && code <= 0x39) {
    return 'NU';
  }
  switch (code) {
    case 0x2d:
      return 'HY';
    case 0x2010: // ‐
    case 0x2012: // ‒
    case 0x2013: // –
    case 0x0964: // । danda
    case 0x0965: // ॥ double danda
      return 'BA';
    case 0x2014: // —
      return 'B2';
    case 0x200b:
      return 'ZW';
    case 0xa0: // no-break space
    case 0x2011: // non-breaking hyphen
    case 0x202f: // narrow no-break space
    case 0x2060: // word joiner
      return 'GL';
    case 0x2f: // /
      return 'SY';
    case 0x2c: // ,
    case 0x2e: // .
    case 0x3a: // :
    case 0x3b: // ;
      return 'IS';
    case 0x21: // !
    case 0x3f: // ?
    case 0xff01: // ！
    case 0xff1f: // ？
      return 'EX';
    case 0x29: // )
    case 0x5d: // ]
      return 'CP';
    case 0x22: // "
    case 0x27: // '
    case 0xab: // «
    case 0xbb: // »
    case 0x2018: // ‘
    case 0x2019: // ’
    case 0x201c: // “
    case 0x201d: // ”
      return 'QU';
    case 0x24: // $
    case 0xa3: // £
    case 0xa5: // ¥
    case 0x20ac: // €
    case 0xff04: // ＄
    case 0xffe1: // ￡
    case 0xffe5: // ￥
      return 'PR';
    case 0x25: // %
    case 0xb0: // °
    case 0x2030: // ‰
    case 0x2103: // ℃
    case 0xff05: // ％
      return 'PO';
    case 0x28: // (
    case 0x5b: // [
    case 0x7b: // {
    case 0x3008: // 〈
    case 0x300a: // 《
    case 0x300c: // 「
    case 0x300e: // 『
    case 0x3010: // 【
    case 0x3014: // 〔
    case 0x3016: // 〖
    case 0x3018: // 〘
    case 0x301a: // 〚
    case 0x301d: // 〝
    case 0xff08: // （
    case 0xff3b: // ［
    case 0xff5b: // ｛
    case 0xff5f: // ｟
    case 0xff62: // ｢
      return 'OP';
    case 0x7d: // }
    case 0x3001: // 、
    case 0x3002: // 。
    case 0x3009: // 〉
    case 0x300b: // 》
    case 0x300d: // 」
    case 0x300f: // 』
    case 0x3011: // 】
    case 0x3015: // 〕
    case 0x3017: // 〗
    case 0x3019: // 〙
    case 0x301b: // 〛
    case 0x301e: // 〞
    case 0x301f: // 〟
    case 0xff09: // ）
    case 0xff0c: // ，
    case 0xff0e: // ．
    case 0xff3d: // ］
    case 0xff5d: // ｝
    case 0xff60: // ｠
    case 0xff61: // ｡
    case 0xff63: // ｣
    case 0xff64: // ､
      return 'CL';
    case 0x2025: // ‥
    case 0x2026: // …
    case 0x301c: // 〜
    case 0x303b: // 〻
    case 0x309b: // ゛
    case 0x309c: // ゜
    case 0x309d: // ゝ
    case 0x309e: // ゞ
    case 0x30fb: // ・
    case 0x30fd: // ヽ
    case 0x30fe: // ヾ
    case 0xff1a: // ：
    case 0xff1b: // ；
    case 0xff65: // ･
      return 'NS';
    default:
      return isIdeographic(code) ? 'ID' : 'AL';
  }
}

/**
 * Class ID, as a line breaker sees it: Han, kana (with CJ folded in),
 * Hangul syllables and jamo, Bopomofo, Yi, the enclosed and
 * compatibility CJK blocks, fullwidth letters and digits, and halfwidth
 * katakana. Punctuation in the same blocks is handled above.
 */
export function isIdeographic(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x2fff) || // CJK and Kangxi radicals
    (code >= 0x3003 && code <= 0x3007) || // 〃々〆〇 and the dictionary mark
    (code >= 0x3012 && code <= 0x3013) || // 〒〓
    (code >= 0x3020 && code <= 0x303a) || // ideographic telegraph symbols, iteration marks
    (code >= 0x3041 && code <= 0x309a) || // Hiragana
    (code >= 0x309f && code <= 0x30fa) || // ゟ and Katakana
    code === 0x30fc || // ー
    code === 0x30ff || // ヿ
    (code >= 0x3100 && code <= 0x31ff) || // Bopomofo, Hangul compatibility jamo, Kanbun, Katakana phonetic extensions
    (code >= 0x3200 && code <= 0x4dbf) || // enclosed CJK, CJK compatibility, Extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xa960 && code <= 0xa97f) || // Hangul Jamo Extended-A
    (code >= 0xac00 && code <= 0xd7ff) || // Hangul syllables and Jamo Extended-B
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK Compatibility Forms
    (code >= 0xff10 && code <= 0xff19) || // fullwidth digits
    (code >= 0xff21 && code <= 0xff3a) || // fullwidth Latin capitals
    (code >= 0xff41 && code <= 0xff5a) || // fullwidth Latin small letters
    (code >= 0xff66 && code <= 0xff9f) || // halfwidth Katakana
    (code >= 0xffe0 && code <= 0xffe6) || // fullwidth signs
    (code >= 0x20000 && code <= 0x3134f) // Extensions B to G
  );
}

/** Class SA: scripts whose words are found by dictionary, not by spaces. */
function isComplexContext(code: number): boolean {
  return (
    (code >= 0x0e00 && code <= 0x0e7f) || // Thai
    (code >= 0x0e80 && code <= 0x0eff) || // Lao
    (code >= 0x1000 && code <= 0x109f) || // Myanmar
    (code >= 0x1780 && code <= 0x17ff) // Khmer
  );
}

function hasComplexContext(paragraph: string): boolean {
  for (let i = 0; i < paragraph.length; i++) {
    if (isComplexContext(paragraph.charCodeAt(i))) {
      return true;
    }
  }
  return false;
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

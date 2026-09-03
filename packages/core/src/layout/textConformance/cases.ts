import type { TextOverflow, TextWrap } from '../TextMeasurer.ts';
import type { ConformanceFontId } from './fonts.ts';

/**
 * Text conformance cases: paragraphs in Gesso's vocabulary, rendered by
 * Chrome in a real font and by `layoutParagraph` from the run widths
 * Chrome's own canvas measured for the same font.
 *
 * The layout cases (`../conformance/cases.ts`) test box algebra around
 * text and use Ahem, whose every glyph is a square, so they can say
 * nothing about where a real paragraph breaks. These cases test the
 * breaking itself: where a line ends, how wide it is, and how tall the
 * paragraph comes out, with glyph widths that vary, kern and ligate.
 *
 * Each case is one paragraph. Its Chrome twin is a flex item in a row
 * as wide as `maxWidth`, so the item's width is CSS fit-content floored
 * at min-content, which is what `layoutParagraph` reports as `width`.
 * `wrap: 'word'` maps to `white-space: pre-wrap`, since Gesso preserves
 * runs of spaces and breaks at `\n` (see `toHtml.ts`).
 *
 * A case Gesso is known to lay out differently from Chrome carries a
 * `divergence` note and runs under `it.fails`, as the layout cases do:
 * the note cannot outlive the difference it describes.
 */
export type TextAlignment = 'left' | 'center' | 'right';

export interface TextCase {
  /** Unique, slash-grouped: `wrap/greedy-at-spaces`. */
  readonly name: string;
  readonly text: string;
  /** Default 'sans'. */
  readonly font?: ConformanceFontId;
  /** Default `DEFAULT_TEXT_CASE_FONT_SIZE`. */
  readonly fontSize?: number;
  /** Default `fontSize × TEXT_CASE_LINE_HEIGHT_FACTOR`, a normal line height. */
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  /** Available width. Unbounded when absent. */
  readonly maxWidth?: number;
  /** Default 'word'. */
  readonly wrap?: TextWrap;
  readonly maxLines?: number;
  readonly overflow?: TextOverflow;
  /** Default 'left'. */
  readonly align?: TextAlignment;
  /**
   * How wide the paragraph's box is. 'fit', the default, shrink-wraps
   * the paragraph as a flex item does: fit-content, floored at
   * min-content. 'fixed' makes the box exactly `maxWidth` wide, as a
   * text node under a tight constraint is, which is the only box an
   * ellipsis can be seen against.
   */
  readonly box?: 'fit' | 'fixed';
  /**
   * Set when Gesso is known to disagree with Chrome. The spec then
   * expects the comparison to fail, so fixing the algorithm surfaces as
   * a test that must have its divergence note removed.
   */
  readonly divergence?: string;
}

export const DEFAULT_TEXT_CASE_FONT_SIZE = 16;
/** `line-height: normal` in Gesso's terms; see `DEFAULT_LINE_HEIGHT_FACTOR`. */
export const TEXT_CASE_LINE_HEIGHT_FACTOR = 1.2;

export function textCaseFontSize(textCase: TextCase): number {
  return textCase.fontSize ?? DEFAULT_TEXT_CASE_FONT_SIZE;
}

export function textCaseLineHeight(textCase: TextCase): number {
  return textCase.lineHeight ?? textCaseFontSize(textCase) * TEXT_CASE_LINE_HEIGHT_FACTOR;
}

const FOX = 'The quick brown fox jumps over the lazy dog';

export const textCases: readonly TextCase[] = [
  // -------------------------------------------------------------------------
  // Sizing without wrapping
  // -------------------------------------------------------------------------
  { name: 'single/natural-width', text: FOX },
  { name: 'single/fits-available-width', text: FOX, maxWidth: 400 },
  { name: 'single/exact-width-is-one-line', text: 'Exactly', maxWidth: 400 },
  { name: 'single/punctuation-and-digits', text: 'Order #1024: 3.5 kg @ $12.99 (net), 100% done!', maxWidth: 600 },

  // -------------------------------------------------------------------------
  // Greedy wrapping at spaces
  // -------------------------------------------------------------------------
  { name: 'wrap/greedy-at-spaces', text: FOX, maxWidth: 120 },
  { name: 'wrap/narrow-one-word-per-line', text: FOX, maxWidth: 40 },
  { name: 'wrap/many-lines', text: `${FOX}. ${FOX}. ${FOX}.`, maxWidth: 160 },
  { name: 'wrap/multiple-spaces-preserved', text: 'one  two   three    four five', maxWidth: 90 },
  { name: 'wrap/spaces-at-break-hang', text: 'alpha beta   gamma delta epsilon', maxWidth: 80 },
  { name: 'wrap/trailing-spaces-hang', text: 'alpha beta gamma   ', maxWidth: 200 },
  { name: 'wrap/long-word-overflows-alone', text: 'Supercalifragilistic ok', maxWidth: 50 },
  { name: 'wrap/long-word-in-the-middle', text: 'a Supercalifragilisticexpialidocious b', maxWidth: 60 },
  { name: 'wrap/punctuation-stays-with-word', text: 'hello, world. yes; no: maybe? sure!', maxWidth: 70 },
  { name: 'wrap/brackets-stay-with-word', text: '(alpha) [beta] {gamma} "delta"', maxWidth: 70 },
  { name: 'wrap/nbsp-does-not-break', text: 'alpha\u00a0beta gamma\u00a0delta epsilon', maxWidth: 90 },
  { name: 'wrap/newline-breaks', text: 'first line\nsecond line\nthird', maxWidth: 300 },
  { name: 'wrap/newline-then-wrap', text: `short\n${FOX}`, maxWidth: 120 },
  { name: 'wrap/blank-line', text: 'first\n\nthird', maxWidth: 300 },
  { name: 'wrap/one-letter-words', text: 'a b c d e f g h i j k l m n o p', maxWidth: 40 },

  // Break opportunities inside words (LineBreaks.ts).
  { name: 'wrap/hyphen-is-a-break-opportunity', text: 'over-the-counter medicine', maxWidth: 70 },
  { name: 'wrap/em-dash-is-a-break-opportunity', text: 'fox\u2014jumps over', maxWidth: 50 },
  { name: 'wrap/zero-width-space-is-a-break-opportunity', text: 'alpha\u200bbeta\u200bgamma', maxWidth: 50 },
  {
    name: 'wrap/soft-hyphen',
    text: 'super\u00adcalifragilistic',
    maxWidth: 60,
    divergence: 'Breaks at U+00AD SOFT HYPHEN and draws a hyphen there; Gesso neither breaks nor draws it.'
  },
  {
    name: 'wrap/slash-is-not-a-break-opportunity',
    text: 'path/to/some/deeply/nested/file.txt',
    maxWidth: 80
  },
  { name: 'wrap/en-dash-is-a-break-opportunity', text: 'pages 10\u201315 and 20\u201325 follow', maxWidth: 60 },
  { name: 'wrap/hyphen-before-digit-does-not-break', text: 'from 10-15 degrees to -5 tonight', maxWidth: 52 },
  { name: 'wrap/word-initial-hyphen-still-breaks', text: 'use -verbose -quiet -all here', maxWidth: 52 },
  { name: 'wrap/hyphen-before-closing-punctuation', text: 'one (re-) use it now', maxWidth: 40 },
  { name: 'wrap/em-dash-between-spaces', text: 'fox \u2014 jumps \u2014 over', maxWidth: 40 },
  { name: 'wrap/em-dash-pair-stays-together', text: 'wait\u2014\u2014what comes next', maxWidth: 50 },
  { name: 'wrap/non-breaking-hyphen', text: 'non\u2011breaking\u2011hyphen words', maxWidth: 70 },
  { name: 'wrap/hyphenated-chain', text: 'state-of-the-art up-to-date know-how', maxWidth: 45 },
  { name: 'wrap/leading-spaces-centered', text: '   led', maxWidth: 200, align: 'center' },

  // Whitespace: pre-wrap keeps a paragraph's leading blanks.
  { name: 'wrap/leading-spaces-first-line', text: '  two leading spaces', maxWidth: 300 },
  { name: 'wrap/leading-spaces-after-newline', text: 'first\n   three after break', maxWidth: 300 },
  { name: 'wrap/leading-spaces-then-wrap', text: `  ${FOX}`, maxWidth: 120 },
  {
    name: 'wrap/tab-advances-to-tab-stop',
    text: 'a\tb\tc',
    maxWidth: 300,
    divergence: 'Advances a tab to the next tab stop (tab-size 8); Gesso gives it the width of one space.'
  },
  {
    name: 'wrap/trailing-newline',
    text: 'first\n',
    maxWidth: 300,
    divergence:
      'A segment break at the end of the text creates no line box in CSS; Gesso keeps the empty line so a caret has somewhere to go after Enter. Intended.'
  },
  {
    name: 'wrap/empty-text',
    text: '',
    maxWidth: 300,
    divergence: 'An empty block has no height in CSS; Gesso keeps one line, so an empty label holds its place.'
  },

  // -------------------------------------------------------------------------
  // Breaking between characters
  // -------------------------------------------------------------------------
  { name: 'char/breaks-anywhere', text: 'Supercalifragilistic', maxWidth: 50, wrap: 'char' },
  { name: 'char/spaces-still-hang', text: 'alpha beta gamma', maxWidth: 30, wrap: 'char' },
  { name: 'char/precomposed-accents', text: 'café naïve résumé', maxWidth: 60, wrap: 'char' },
  {
    name: 'char/combining-marks-stay-with-base',
    text: 'e\u0301e\u0301e\u0301e\u0301e\u0301e\u0301e\u0301e\u0301',
    maxWidth: 30,
    wrap: 'char',
    divergence:
      'Chrome takes no break-all opportunity directly after a combining mark and overflows the box with four clusters; Gesso breaks between any two clusters. Chrome is the odd one here.'
  },

  // -------------------------------------------------------------------------
  // No wrapping
  // -------------------------------------------------------------------------
  { name: 'none/overflows-available-width', text: FOX, maxWidth: 50, wrap: 'none' },
  { name: 'none/newline-still-breaks', text: 'first line\nsecond', maxWidth: 50, wrap: 'none' },

  // -------------------------------------------------------------------------
  // Clamping and ellipsis. Chrome does not expose which characters an
  // ellipsis replaced, so a truncated line compares by its start only.
  // -------------------------------------------------------------------------
  { name: 'clamp/two-lines', text: FOX, maxWidth: 120, maxLines: 2 },
  { name: 'clamp/two-lines-ellipsis', text: FOX, maxWidth: 120, maxLines: 2, overflow: 'ellipsis' },
  { name: 'clamp/more-lines-than-text', text: 'short text', maxWidth: 120, maxLines: 3 },
  { name: 'ellipsis/nowrap-overflow', text: FOX, maxWidth: 120, wrap: 'none', overflow: 'ellipsis', box: 'fixed' },
  { name: 'ellipsis/nowrap-fits', text: 'fits', maxWidth: 120, wrap: 'none', overflow: 'ellipsis', box: 'fixed' },
  {
    name: 'ellipsis/long-word-in-wrapping-text',
    text: 'a Supercalifragilisticexpialidocious b',
    maxWidth: 60,
    overflow: 'ellipsis',
    box: 'fixed'
  },

  // -------------------------------------------------------------------------
  // Real glyphs: diacritics, ligatures, kerning, tracking
  // -------------------------------------------------------------------------
  { name: 'glyphs/precomposed-diacritics', text: 'café naïve résumé Ångström garçon', maxWidth: 110 },
  {
    name: 'glyphs/combining-diacritics',
    text: 'cafe\u0301 nai\u0308ve re\u0301sume\u0301 A\u030angstro\u0308m garc\u0327on',
    maxWidth: 110
  },
  { name: 'glyphs/ligatures', text: 'difficult waffle office fjord affluent', maxWidth: 90 },
  { name: 'glyphs/kerning-pairs', text: 'AVATAR WAVY Type LTA To Ya', maxWidth: 100 },
  { name: 'glyphs/uppercase-wide', text: 'WWWW MMMM OOOO IIII', maxWidth: 80 },
  { name: 'spacing/letter-spacing-wraps-later', text: FOX, maxWidth: 120, letterSpacing: 2 },
  { name: 'spacing/negative-letter-spacing', text: FOX, maxWidth: 120, letterSpacing: -0.5 },

  // -------------------------------------------------------------------------
  // Sizes and line heights
  // -------------------------------------------------------------------------
  { name: 'size/small', text: FOX, maxWidth: 90, fontSize: 11 },
  { name: 'size/large-with-tall-lines', text: FOX, maxWidth: 200, fontSize: 24, lineHeight: 40 },
  { name: 'size/fractional', text: FOX, maxWidth: 100, fontSize: 13.5, lineHeight: 17 },
  { name: 'size/line-height-below-content', text: FOX, maxWidth: 120, fontSize: 16, lineHeight: 14 },

  // -------------------------------------------------------------------------
  // Alignment: where a line starts once it is placed
  // -------------------------------------------------------------------------
  { name: 'align/center', text: FOX, maxWidth: 120, align: 'center' },
  { name: 'align/right', text: FOX, maxWidth: 120, align: 'right' },
  { name: 'align/center-ignores-hanging-spaces', text: 'alpha beta   gamma delta', maxWidth: 80, align: 'center' },
  { name: 'align/right-single-line-natural-width', text: 'right', maxWidth: 200, align: 'right' },
  { name: 'align/right-in-fixed-box', text: 'right', maxWidth: 200, align: 'right', box: 'fixed' },
  { name: 'align/center-in-fixed-box', text: 'centre', maxWidth: 200, align: 'center', box: 'fixed' }
];

/**
 * A fingerprint of everything about a case that affects its result,
 * so an edited case fails the spec until the fixtures are regenerated.
 * The name and the divergence note are excluded: neither changes what
 * Chrome renders.
 */
export function textCaseFingerprint(textCase: TextCase): string {
  const { name: _name, divergence: _divergence, ...rest } = textCase;
  const source = JSON.stringify(rest, Object.keys(rest).sort());
  // FNV-1a, 32-bit, as the layout cases use.
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

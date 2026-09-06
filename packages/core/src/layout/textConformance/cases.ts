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

/**
 * One run of a case: a stretch of the text with a font of its own.
 *
 * Offsets rather than text, so the case has one source of truth for
 * what it says and the runs only say where the fonts change. Its
 * Chrome twin is a `<span>` over the same characters.
 */
export interface TextCaseSpan {
  readonly start: number;
  readonly end: number;
  /** The face, or the faces tried in order. The paragraph's when absent. */
  readonly font?: ConformanceFontId | readonly ConformanceFontId[];
  readonly fontSize?: number;
  readonly fontWeight?: string | number;
  readonly fontStyle?: 'normal' | 'italic' | 'oblique';
  readonly fontStretch?: string;
  readonly fontVariant?: 'normal' | 'small-caps';
  readonly fontKerning?: 'auto' | 'normal' | 'none';
  readonly letterSpacing?: number;
}

export interface TextCase {
  /** Unique, slash-grouped: `wrap/greedy-at-spaces`. */
  readonly name: string;
  readonly text: string;
  /** The face, or the faces tried in order. Default 'sans'. */
  readonly font?: ConformanceFontId | readonly ConformanceFontId[];
  /** A BCP 47 tag for Chrome's `lang`; Gesso has no locale, so it only documents the case. */
  readonly lang?: string;
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
  /** The paragraph's base direction. Default 'ltr'. */
  readonly direction?: 'ltr' | 'rtl';
  /**
   * How wide the paragraph's box is. 'fit', the default, shrink-wraps
   * the paragraph as a flex item does: fit-content, floored at
   * min-content. 'fixed' makes the box exactly `maxWidth` wide, as a
   * text node under a tight constraint is, which is the only box an
   * ellipsis can be seen against.
   */
  readonly box?: 'fit' | 'fixed';
  /**
   * How far a width or position may differ from Chrome's and still
   * agree, in px. Default `TEXT_TOLERANCE` (0.1); a case sets it only
   * for a reason the case states.
   */
  readonly tolerance?: number;
  /**
   * Set when Gesso is known to disagree with Chrome. The spec then
   * expects the comparison to fail, so fixing the algorithm surfaces as
   * a test that must have its divergence note removed.
   */
  readonly divergence?: string;
  /**
   * Stretches of `text` with fonts of their own. The text is still one
   * string, so every offset in the expectation means what it always
   * meant; see `ParagraphLayout.ts`.
   */
  readonly spans?: readonly TextCaseSpan[];
}

export const DEFAULT_TEXT_CASE_FONT_SIZE = 16;
/** `line-height: normal` in Gesso's terms; see `DEFAULT_LINE_HEIGHT_FACTOR`. */
export const TEXT_CASE_LINE_HEIGHT_FACTOR = 1.2;

/** The case's faces as a list, first tried first. */
export function textCaseFonts(textCase: TextCase): readonly ConformanceFontId[] {
  const font = textCase.font ?? 'sans';
  return typeof font === 'string' ? [font] : font;
}

export function textCaseFontSize(textCase: TextCase): number {
  return textCase.fontSize ?? DEFAULT_TEXT_CASE_FONT_SIZE;
}

export function textCaseLineHeight(textCase: TextCase): number {
  return textCase.lineHeight ?? textCaseFontSize(textCase) * TEXT_CASE_LINE_HEIGHT_FACTOR;
}

const FOX = 'The quick brown fox jumps over the lazy dog';
/** See the CJK group below. */
const CJK_TOLERANCE = 2;

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
  // Chrome breaks after a hyphen before digits when it has to, but a
  // hyphen that begins its word is a minus sign and sticks: the range
  // fits at 52 and stays whole; the date at 60 does not, and breaks.
  { name: 'wrap/hyphen-in-a-range-stays-when-it-fits', text: 'from 10-15 degrees to -5 tonight', maxWidth: 52 },
  { name: 'wrap/hyphen-before-digit-breaks-when-forced', text: '2024-07-25 and 1234-56', maxWidth: 60 },
  { name: 'wrap/minus-sign-stays-with-its-digit', text: 'to -5 tonight', maxWidth: 30 },
  { name: 'wrap/letters-hyphen-digits-break-after-the-hyphen', text: 'Ägypten-2015-03-69a.JPG', maxWidth: 100 },
  // Chrome breaks after a prefix sign before an opening bracket, and
  // the break shrinks the paragraph's min-content, so every line wraps
  // at the available width instead of the unbroken tail's.
  { name: 'wrap/plus-before-bracket-breaks', text: 'aaaa bbbb cccc dddd (KUVKUVN5327+(numero)).jpg', maxWidth: 160 },
  // Chrome also breaks between two hyphen-minus, against LB21.
  { name: 'wrap/double-hyphen-breaks-between-the-hyphens', text: 'files--0001--0075--010001-75-00036', maxWidth: 100 },
  // Chrome's fast path for pairs of ASCII characters never breaks after
  // a slash; a character outside ASCII after it is decided by ICU, which
  // allows the break. Both are what Wikipedia titles meet.
  {
    name: 'wrap/slash-breaks-before-non-ascii',
    text: 'Projet:Fantasy et fantastique/Évaluation/Index/7',
    maxWidth: 160
  },
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
  // CJK: no spaces, a break between any two ideographs, kinsoku at
  // punctuation. Every glyph in the face is one em wide.
  //
  // Chrome's DOM shapes a CJK line as one run and applies the font's
  // kana kerning; its canvas shapes CJK character by character and does
  // not, so `measureText` and the DOM differ by up to 2 px on a line
  // whatever `lang` says (measured: まってく 62.09 vs 64.00, 서울은
  // 대한민 92.81 vs 91.90). Gesso draws with the canvas, so it is
  // consistent with itself; these cases allow Chrome that gap.
  // -------------------------------------------------------------------------
  {
    name: 'cjk/ja-breaks-between-ideographs-and-kana',
    text: '東京は日本の首都であり、世界最大の都市圏です。',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 100
  },
  {
    name: 'cjk/ja-no-break-before-comma-or-full-stop',
    text: 'これは、テストです。はい、そうです。',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 80
  },
  {
    name: 'cjk/ja-brackets-stay-with-their-content',
    text: 'これは「テスト」です。はい、そうです！',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 80
  },
  {
    name: 'cjk/ja-small-kana-and-prolonged-mark-are-breakable',
    text: 'ちょっとまってください。キャンペーン',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 64
  },
  {
    name: 'cjk/ja-mixed-with-latin',
    text: '私はGessoフレームワークを使います',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 90
  },
  {
    name: 'cjk/ja-digits-and-counters',
    text: '合計12個で1,000円になります',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 70
  },
  {
    name: 'cjk/ja-percent-and-yen',
    text: '本日は50％オフ、¥1200からです',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 70
  },
  {
    name: 'cjk/ja-middle-dot-and-leaders',
    text: 'りんご・みかん・バナナ……以上です',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 64
  },
  {
    name: 'cjk/ja-ideographic-space-hangs',
    text: '東京　大阪　名古屋　京都　福岡',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 70
  },
  {
    name: 'cjk/ja-wave-dash-and-tilde',
    text: '午前9時〜午後5時まで営業しています',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 70
  },
  {
    name: 'cjk/zh-breaks-between-ideographs',
    text: '北京是中华人民共和国的首都，也是政治中心。',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'zh',
    maxWidth: 100
  },
  {
    name: 'cjk/zh-fullwidth-punctuation',
    text: '你好，世界！你好吗？很好。',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'zh',
    maxWidth: 56
  },
  {
    name: 'cjk/ko-breaks-between-syllables-and-at-spaces',
    text: '서울은 대한민국의 수도이며 가장 큰 도시입니다.',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ko',
    maxWidth: 100
  },
  { name: 'cjk/ja-natural-width', text: '日本語のテキスト', font: 'cjk', tolerance: CJK_TOLERANCE, lang: 'ja' },
  {
    name: 'cjk/ja-clamped',
    text: '東京は日本の首都であり、世界最大の都市圏です。',
    font: 'cjk',
    tolerance: CJK_TOLERANCE,
    lang: 'ja',
    maxWidth: 100,
    maxLines: 2
  },

  // -------------------------------------------------------------------------
  // Right to left: Arabic and Hebrew. Breaking is at spaces, as in Latin;
  // what changes is where a line sits, which way neutral characters
  // resolve, and where a run of digits or Latin goes on the line.
  // -------------------------------------------------------------------------
  {
    name: 'rtl/ar-wraps-and-aligns-right',
    text: 'السلام عليكم ورحمة الله وبركاته',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 120
  },
  { name: 'rtl/ar-natural-width', text: 'مرحبا بالعالم', font: 'arabic', lang: 'ar', direction: 'rtl' },
  {
    name: 'rtl/ar-digits-run-left-to-right',
    text: 'الطلب رقم 1024 وصل في 3 أيام',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 160
  },
  {
    name: 'rtl/ar-latin-word',
    text: 'استخدم Gesso للواجهة',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 200
  },
  {
    name: 'rtl/ar-punctuation-at-line-end',
    text: 'مرحبا، كيف حالك؟ أنا بخير!',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 110
  },
  {
    name: 'rtl/ar-brackets-mirror',
    text: '(نص) بين قوسين',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 200
  },
  {
    name: 'rtl/ar-hanging-spaces',
    text: 'كلمة   كلمة   كلمة',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 60
  },
  {
    name: 'rtl/ar-center',
    text: 'السلام عليكم ورحمة الله',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 120,
    align: 'center'
  },
  {
    name: 'rtl/ar-left-explicit',
    text: 'السلام عليكم ورحمة الله',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 120,
    align: 'left'
  },
  {
    name: 'rtl/ar-in-ltr-paragraph',
    text: 'السلام عليكم ورحمة الله وبركاته',
    font: 'arabic',
    lang: 'ar',
    maxWidth: 120
  },
  {
    name: 'rtl/ar-fixed-box',
    text: 'مرحبا',
    font: 'arabic',
    lang: 'ar',
    direction: 'rtl',
    maxWidth: 200,
    box: 'fixed'
  },
  {
    name: 'rtl/he-wraps-and-aligns-right',
    text: 'שלום עולם, זהו משפט בעברית שנשבר לשורות',
    font: 'hebrew',
    lang: 'he',
    direction: 'rtl',
    maxWidth: 120
  },
  { name: 'rtl/he-digits', text: 'הזמנה מספר 42 הגיעה', font: 'hebrew', lang: 'he', direction: 'rtl', maxWidth: 200 },

  // -------------------------------------------------------------------------
  // Devanagari: spaces between words, conjunct clusters that must never
  // split, and a danda that stays with the word before it.
  // -------------------------------------------------------------------------
  {
    name: 'indic/hi-wraps-at-spaces',
    text: 'नमस्ते दुनिया, यह एक परीक्षण वाक्य है।',
    font: 'devanagari',
    lang: 'hi',
    maxWidth: 120
  },
  { name: 'indic/hi-conjuncts-stay-whole', text: 'क्षत्रिय संस्कृति स्त्री', font: 'devanagari', lang: 'hi', maxWidth: 90 },
  { name: 'indic/hi-digits-both-kinds', text: 'कुल १२३ वस्तुएँ और 456 रुपये', font: 'devanagari', lang: 'hi', maxWidth: 100 },
  { name: 'indic/hi-natural-width', text: 'नमस्ते दुनिया', font: 'devanagari', lang: 'hi' },
  {
    name: 'indic/hi-char-wrap-breaks-between-clusters',
    text: 'क्षत्रियसंस्कृति',
    font: 'devanagari',
    lang: 'hi',
    maxWidth: 40,
    wrap: 'char',
    divergence:
      'Chrome takes no break-all opportunity directly after a cluster that ends in a vowel sign or virama and overflows the box; Gesso breaks between any two clusters. The same Chrome quirk as char/combining-marks-stay-with-base.'
  },
  { name: 'indic/hi-danda-then-word', text: 'यह है।वह है', font: 'devanagari', lang: 'hi', maxWidth: 50 },

  // -------------------------------------------------------------------------
  // Thai: no spaces between words, so a break is a dictionary decision.
  // Chrome's are ICU's, and Intl.Segmenter's word boundaries are the
  // same dictionary; the fixtures check they agree.
  // -------------------------------------------------------------------------
  {
    name: 'thai/breaks-at-word-boundaries',
    text: 'ภาษาไทยเป็นภาษาที่เขียนโดยไม่เว้นวรรคระหว่างคำ',
    font: 'thai',
    lang: 'th',
    maxWidth: 120
  },
  { name: 'thai/narrow', text: 'ภาษาไทยเป็นภาษาที่เขียนโดยไม่เว้นวรรคระหว่างคำ', font: 'thai', lang: 'th', maxWidth: 60 },
  { name: 'thai/spaces-and-digits', text: 'วันนี้อากาศดี ราคา 250 บาท', font: 'thai', lang: 'th', maxWidth: 140 },
  { name: 'thai/natural-width', text: 'สวัสดีชาวโลก', font: 'thai', lang: 'th' },
  { name: 'thai/mixed-with-latin', text: 'ใช้ Gesso สร้างหน้าจอได้เร็ว', font: 'thai', lang: 'th', maxWidth: 110 },

  // -------------------------------------------------------------------------
  // Emoji: colour glyphs from a second face, sequences that must stay
  // whole, and a break allowed on either side of one.
  // -------------------------------------------------------------------------
  { name: 'emoji/run-breaks-between-emoji', text: '😀😃😄😁😆😅', font: ['sans', 'emoji'], maxWidth: 70 },
  { name: 'emoji/mixed-with-words', text: 'Hello 😀 world 🌍 ok', font: ['sans', 'emoji'], maxWidth: 120 },
  { name: 'emoji/sequences-stay-whole', text: '👨‍👩‍👧‍👦 🇯🇵 1️⃣ 👍🏽 ❤️ 🏳️‍🌈', font: ['sans', 'emoji'] },
  { name: 'emoji/zwj-sequences-narrow', text: '👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦', font: ['sans', 'emoji'], maxWidth: 50 },
  { name: 'emoji/breaks-beside-a-word', text: 'wow😀amazing😀yes', font: ['sans', 'emoji'], maxWidth: 120 },
  { name: 'emoji/flags-pair-up', text: '🇯🇵🇫🇷🇩🇪🇮🇹🇪🇸', font: ['sans', 'emoji'], maxWidth: 50 },
  { name: 'emoji/char-wrap-keeps-sequences', text: '👍🏽👍🏽👍🏽👍🏽', font: ['sans', 'emoji'], maxWidth: 45, wrap: 'char' },
  { name: 'emoji/symbols-as-emoji', text: 'sun ☀️ heart ❤️ check ✅ done', font: ['sans', 'emoji'], maxWidth: 90 },

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
  { name: 'align/center-in-fixed-box', text: 'centre', maxWidth: 200, align: 'center', box: 'fixed' },

  // Found by scripts/wring-titles.ts in live Wikipedia titles; see
  // docs/FIREHOSE_ROADMAP.md S4.
  {
    name: 'cjk/ko-slash-after-hangul',
    text: '위키백과:미번역 문서/핀란드',
    font: ['cjk', 'sans'],
    lang: 'ko',
    maxWidth: 160,
    tolerance: CJK_TOLERANCE
  },
  {
    name: 'cjk/zh-fullwidth-closing-bracket-at-line-end',
    text: '湖北省武汉经济技术开发区人民法院（2022）鄂0191民初9069号民事判决书',
    font: ['cjk', 'sans'],
    lang: 'zh',
    maxWidth: 160,
    tolerance: CJK_TOLERANCE,
    divergence:
      'Lets a full-width closing bracket at a line end give up its trailing half em (text-spacing-trim: normal, the allow-end part), so twelve characters fit in 160 px; Gesso measures the bracket at its full advance and breaks a character earlier.'
  },
  {
    name: 'clamp/ellipsis-not-for-a-fifth-of-a-pixel',
    text: 'User:Emiya1980/sandbox6',
    maxWidth: 200,
    maxLines: 1,
    overflow: 'ellipsis',
    box: 'fixed',
    divergence:
      'Draws the whole line, 200.16 px in a 200 px box, without an ellipsis; Gesso ellipsises any line wider than its box.'
  },

  // -------------------------------------------------------------------------
  // Runs: one paragraph in more than one font
  //
  // The Chrome twin is the same paragraph with a `<span>` over each
  // run, so every one of these asks the same question the cases above
  // ask, of text whose width changes part way along a line. A run
  // inherits the paragraph's line height as a length, which is why the
  // line box only grows where a run's own font does not fit inside it.
  // -------------------------------------------------------------------------
  {
    name: 'runs/bold-in-the-middle',
    text: 'The quick brown fox jumps',
    spans: [{ start: 10, end: 15, fontWeight: 700 }]
  },
  {
    name: 'runs/bold-changes-where-the-line-breaks',
    text: 'The quick brown fox jumps over the lazy dog',
    maxWidth: 140,
    spans: [{ start: 4, end: 19, fontWeight: 700 }]
  },
  {
    name: 'runs/italic-in-the-middle',
    text: 'A word set in italic type here',
    spans: [{ start: 14, end: 20, fontStyle: 'italic' }]
  },
  {
    name: 'runs/italic-wraps',
    text: 'A sentence with a phrase set in italic type that has to wrap',
    maxWidth: 160,
    spans: [{ start: 25, end: 42, fontStyle: 'italic' }]
  },
  {
    name: 'runs/three-runs-and-the-prose-between-them',
    text: 'Read the guide, run the code, and then ship it',
    maxWidth: 180,
    spans: [
      { start: 9, end: 14, fontWeight: 700 },
      { start: 24, end: 28, letterSpacing: 1 },
      { start: 39, end: 43, fontStyle: 'italic' }
    ]
  },
  {
    name: 'runs/another-family-inside-the-line',
    text: 'Call it with code() and see',
    maxWidth: 200,
    spans: [{ start: 13, end: 19, font: 'cjk' }]
  },
  {
    name: 'runs/smaller-run-on-one-line',
    text: 'Normal with smaller inside',
    spans: [{ start: 12, end: 19, fontSize: 12 }]
  },
  {
    name: 'runs/larger-run-on-one-line',
    text: 'Normal with larger inside',
    spans: [{ start: 12, end: 18, fontSize: 24 }]
  },
  {
    name: 'runs/a-taller-run-grows-only-its-own-line',
    text: 'Larger words up front and then a long tail of ordinary text that wraps',
    maxWidth: 200,
    spans: [{ start: 0, end: 12, fontSize: 24 }],
    divergence:
      'Sizes each line box separately, so only the line carrying the larger run is taller; Gesso gives every line of a paragraph the tallest line box, because a paragraph is lines times one line height here and both renderers step by it.'
  },
  {
    name: 'runs/tracking-on-one-run-only',
    text: 'plain tracked plain',
    spans: [{ start: 6, end: 13, letterSpacing: 2 }]
  },
  {
    name: 'runs/small-caps-on-one-run',
    text: 'A run in small caps here',
    spans: [{ start: 9, end: 19, fontVariant: 'small-caps' }]
  },
  {
    name: 'runs/kerning-off-on-one-run',
    text: 'AV Wa Ta AV Wa Ta',
    spans: [{ start: 9, end: 17, fontKerning: 'none' }]
  },
  {
    name: 'runs/a-run-that-changes-nothing-is-the-paragraph',
    text: 'The quick brown fox jumps over the lazy dog',
    maxWidth: 140,
    spans: [{ start: 10, end: 15 }]
  },
  {
    name: 'runs/run-boundary-at-a-break',
    text: 'alpha beta gamma delta',
    maxWidth: 90,
    spans: [{ start: 6, end: 10, fontWeight: 700 }]
  },
  {
    name: 'runs/clamped-line-ends-in-the-last-run',
    text: 'A heading with bold words that does not fit its box',
    maxWidth: 200,
    maxLines: 1,
    overflow: 'ellipsis',
    box: 'fixed',
    spans: [{ start: 15, end: 26, fontWeight: 700 }]
  },
  {
    name: 'runs/centred-with-runs',
    text: 'A centred line with bold in it',
    maxWidth: 140,
    align: 'center',
    spans: [{ start: 20, end: 24, fontWeight: 700 }]
  }
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

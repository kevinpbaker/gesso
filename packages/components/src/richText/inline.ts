/**
 * Inline markdown, as runs of style over the source string.
 *
 * The runs cover the string exactly, character for character, because
 * an editable's `spans` are presentation over the text being typed and
 * Gesso draws the field unstyled when they disagree. So the markers
 * stay in the text: `**bold**` is two muted asterisks, a bold word and
 * two more, or, with `hideMarkers`, the bold word alone, the asterisks
 * kept in the text as hidden runs the caret steps over.
 *
 * Markdown's own constructs are built in. Tokens such as a mention or
 * an issue key are not markdown at all, only plain text an application
 * gives a meaning, so they arrive from outside as `RichTextToken`s
 * (usually on a completion source) and are drawn as chips.
 *
 * No framework import: a run is plain data that happens to have the
 * shape of `UiTextSpan`.
 */

export interface InlineRun {
  readonly text: string;
  readonly fontWeight?: number;
  readonly fontStyle?: 'italic';
  readonly fontFamily?: string;
  readonly textDecoration?: 'line-through' | 'underline';
  readonly color?: string;
  readonly backgroundColor?: string;
  /** Markup the editor keeps in the text but does not draw. */
  readonly hidden?: boolean;
}

/**
 * Plain text an application gives a meaning, drawn as a chip: a mention,
 * an issue key. It stays plain text in the markdown; only how it is
 * drawn changes.
 */
export interface RichTextToken {
  /**
   * The token after its sigil, matched where a word starts (the
   * character before it is not a letter or a digit). Its flags are
   * ignored: it is matched sticky, at one place at a time.
   */
  readonly pattern: RegExp;
  /** A sigil the token starts with, such as `@`, drawn in the chip at normal weight. */
  readonly sigil?: string;
  /** Where it can start, when that is narrower than any word's start: an issue key only after a space or an opening bracket. */
  readonly startsAt?: (text: string, at: number) => boolean;
}

type Style = Omit<InlineRun, 'text'>;

interface Token {
  readonly pattern: RegExp;
  /** The style of each capture group, in order: open marker, content, close marker, … */
  readonly styles: readonly Style[];
  /** Where it can start, when that's narrower than any word's start. */
  readonly startsAt?: (source: string, at: number) => boolean;
}

/**
 * Whether a word starts at `at`: the character before isn't a letter or
 * a digit. Markup only starts at one, so `snake_case` stays plain and
 * `me@x.dev` is no mention.
 */
export function wordStart(source: string, at: number): boolean {
  return at === 0 || !/[A-Za-z0-9]/.test(source[at - 1]!);
}

/**
 * Whether an issue key can start at `at`: at the start of the text,
 * after a space, or after opening punctuation, as in `(WEB-12)` or
 * `"WEB-12"`. After anything else the capitals belong to something
 * else: `@WEB` is a handle being typed, `x-WEB-12` one word.
 */
export function keyStart(source: string, at: number): boolean {
  return at === 0 || /[\s([{"'“‘«]/.test(source[at - 1]!);
}

const MARK: Style = { color: 'textMuted' };
const HIDDEN: Style = { hidden: true };
const CODE_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, monospace';
// A link and a chip are the accent a `Link` is drawn in; the chip sits on
// a control's ground, so it reads as a thing in the text, not as text.
const CHIP: Style = { color: 'controlAccent', backgroundColor: 'controlBackground' };

const MARKDOWN: readonly Token[] = [
  { pattern: /(`)([^`]+)(`)/y, styles: [MARK, { fontFamily: CODE_FAMILY, backgroundColor: 'surface' }, MARK] },
  { pattern: /(\*\*|__)(?=\S)(.+?)(?<=\S)(\1)/y, styles: [MARK, { fontWeight: 700 }, MARK] },
  { pattern: /(~~)(?=\S)(.+?)(?<=\S)(~~)/y, styles: [MARK, { textDecoration: 'line-through' }, MARK] },
  { pattern: /(\*|_)(?=\S)(.+?)(?<=\S)(\1)/y, styles: [MARK, { fontStyle: 'italic' }, MARK] },
  {
    pattern: /(\[)([^\]]+)(\]\()([^)\s]+)(\))/y,
    styles: [MARK, { color: 'controlAccent', textDecoration: 'underline' }, MARK, MARK, MARK]
  }
];

/** Characters that can open a markdown construct; everything else is skipped in one go when there are no tokens. */
const OPENERS = /[`*_~[]/;

/**
 * An application's token as one of the built-in kind: the sigil, then
 * the rest, the whole of it on one chip. Compiled once per token, since
 * the runs are worked out on every keystroke.
 */
const compiled = new WeakMap<RichTextToken, Token>();
function compile(token: RichTextToken): Token {
  let made = compiled.get(token);
  if (made === undefined) {
    const sigil = (token.sigil ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    made = {
      pattern: new RegExp(`(${sigil})(${token.pattern.source})`, 'y'),
      styles: [CHIP, { ...CHIP, fontWeight: 600 }],
      ...(token.startsAt === undefined ? {} : { startsAt: token.startsAt })
    };
    compiled.set(token, made);
  }
  return made;
}

export interface InlineOptions {
  /** Hides the markup rather than muting it, which is how the editor draws every block. */
  readonly hideMarkers?: boolean;
  /** Tokens to draw as chips, after markdown's own constructs. */
  readonly tokens?: readonly RichTextToken[];
}

/** The runs for a block's source. */
export function inlineRuns(source: string, options: InlineOptions = {}): InlineRun[] {
  const marker: Style = options.hideMarkers === true ? HIDDEN : MARK;
  const extra = options.tokens ?? [];
  const all = extra.length === 0 ? MARKDOWN : [...MARKDOWN, ...extra.map(compile)];
  const runs: InlineRun[] = [];
  let plain = '';
  let at = 0;

  const flush = (): void => {
    if (plain !== '') {
      runs.push({ text: plain });
      plain = '';
    }
  };

  outer: while (at < source.length) {
    const char = source[at]!;
    // A token can start with any character, so with tokens every word's
    // start is tried; without them, only markdown's openers are.
    if ((extra.length > 0 || OPENERS.test(char)) && wordStart(source, at)) {
      for (const token of all) {
        if (token.startsAt !== undefined && !token.startsAt(source, at)) {
          continue;
        }
        token.pattern.lastIndex = at;
        const match = token.pattern.exec(source);
        if (match !== null && match[0].length > 0) {
          flush();
          const whole = {};
          match.slice(1).forEach((group, index) => {
            if (group !== undefined && group !== '') {
              const style = token.styles[index] === MARK ? marker : token.styles[index];
              const run = { text: group, ...style };
              if (style === marker) markers.add(run);
              tokens.set(run, whole);
              runs.push(run);
            }
          });
          at += match[0].length;
          continue outer;
        }
      }
    }
    plain += char;
    at += 1;
  }
  flush();
  return runs;
}

/** The runs that are markup rather than content, for `readingRuns`. */
const markers = new WeakSet<InlineRun>();

/**
 * The runs for text that is only read, never edited: the same styles
 * with the markers left out, so `**bold**` is drawn as a bold word. A
 * comment has no caret, so nothing needs the runs to spell its source.
 */
export function readingRuns(source: string, tokens: readonly RichTextToken[] = []): InlineRun[] {
  return inlineRuns(source, { tokens }).filter(run => !markers.has(run));
}

/** The token each run of a construct belongs to, for `inlineSlice`. */
const tokens = new WeakMap<InlineRun, object>();

/**
 * The markdown for `start`..`end` of a block's source, with whatever
 * markup frames the text it takes. The markers are hidden, so a
 * selection made by what's drawn can end inside them (`**steps` for
 * the word "steps"); a construct whose text is taken, in whole or in
 * part, is written out whole around that part, and markers whose text
 * is left out are dropped.
 */
export function inlineSlice(source: string, start: number, end: number, chips: readonly RichTextToken[] = []): string {
  const runs = inlineRuns(source, { tokens: chips });
  const taken = new Set<object>();
  let at = 0;
  for (const run of runs) {
    const token = tokens.get(run);
    if (token !== undefined && !markers.has(run) && at < end && at + run.text.length > start) taken.add(token);
    at += run.text.length;
  }
  let out = '';
  at = 0;
  for (const run of runs) {
    const token = tokens.get(run);
    const from = at;
    at += run.text.length;
    if (markers.has(run)) {
      if (token !== undefined && taken.has(token)) out += run.text;
    } else {
      out += run.text.slice(Math.max(0, start - from), Math.max(0, Math.min(run.text.length, end - from)));
    }
  }
  return out;
}

/** Whether a set of runs still spells the source, which is the invariant Gesso checks. */
export function covers(runs: readonly InlineRun[], source: string): boolean {
  return runs.map(run => run.text).join('') === source;
}

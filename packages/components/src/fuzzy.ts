import type { UiColorValue, UiTextSpan } from 'gesso-core';

/**
 * The fuzzy matching `CommandPalette` and a searchable `Menu` share.
 *
 * Every word of the query has to be found, in the label or, for less,
 * in the other texts (keywords, a detail, a group). A word is found as
 * a run of characters (best at the start of the label, then at the
 * start of a word) or else as a subsequence, `tgt` in "Toggle
 * terminal", which scores higher the more of it is contiguous and lands
 * on word starts. Case and accents don't count, and a shorter label
 * wins a tie.
 */

/** Where a query matched, and how well: higher is better. */
export interface FuzzyMatch {
  readonly score: number;
  /** The label's characters that matched, by index, to draw strong. */
  readonly positions: readonly number[];
}

/** Below a label's match: a word found only in the other texts. */
const ELSEWHERE = 0.4;

const EVERYTHING: FuzzyMatch = { score: 0, positions: [] };

/** How well `query` matches `label` and `others`, or null when some word of it is in neither. */
export function fuzzyMatch(label: string, others: readonly string[], query: string): FuzzyMatch | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return EVERYTHING;
  }
  const folded = fold(label);
  const elsewhere = fold(others.join(' '));
  let score = 0;
  const positions = new Set<number>();
  for (const word of words) {
    const found = findWord(word, folded);
    if (found !== null) {
      score += found.score;
      for (const at of found.positions) positions.add(at);
      continue;
    }
    const other = findWord(word, elsewhere);
    if (other === null) {
      return null;
    }
    score += other.score * ELSEWHERE;
  }
  return { score: score - folded.length * 0.01, positions: [...positions].sort((a, b) => a - b) };
}

/** The label in runs, the matched characters strong and in the primary colour, as a search result marks what it found. */
export function matchSpans(label: string, positions: readonly number[], color: UiColorValue): UiTextSpan[] {
  if (positions.length === 0) return [{ text: label, color }];
  const strong = new Set(positions);
  const spans: UiTextSpan[] = [];
  let start = 0;
  for (let at = 1; at <= label.length; at++) {
    if (at === label.length || strong.has(at) !== strong.has(start)) {
      const text = label.slice(start, at);
      spans.push(
        strong.has(start)
          ? { text, color: color === 'controlForegroundDisabled' ? color : 'primary', fontWeight: 600 }
          : { text, color }
      );
      start = at;
    }
  }
  return spans;
}

/** One word found in a text: its score and the characters it landed on. */
interface Found {
  readonly score: number;
  readonly positions: readonly number[];
}

function findWord(word: string, text: string): Found | null {
  const at = text.indexOf(word);
  if (at !== -1) {
    const run = Array.from({ length: word.length }, (_, offset) => at + offset);
    if (at === 0) return { score: 100 + word.length * 3, positions: run };
    return {
      score: (isStart(text, at) ? 80 : 50) + word.length * 3 - Math.min(at, 20) * 0.5,
      positions: run
    };
  }
  // A subsequence, tried from each place its first letter is (up to a
  // few), keeping the best: `tt` in "toggle terminal" lands on both t's
  // that start words rather than the first two t's.
  let best: Found | null = null;
  let tries = 0;
  for (let from = text.indexOf(word[0]!); from !== -1 && tries < 12; from = text.indexOf(word[0]!, from + 1), tries++) {
    const found = subsequence(word, text, from);
    if (found !== null && (best === null || found.score > best.score)) best = found;
  }
  return best;
}

function subsequence(word: string, text: string, from: number): Found | null {
  let score = 0;
  let previous = -2;
  let position = from;
  const positions: number[] = [];
  for (const char of word) {
    const found = text.indexOf(char, position);
    if (found === -1) return null;
    if (found === previous + 1) score += 5;
    if (isStart(text, found)) score += 8;
    score += 1 - Math.min(found - position, 10) * 0.3;
    positions.push(found);
    previous = found;
    position = found + 1;
  }
  return { score: score - Math.min(from, 20) * 0.2, positions };
}

function isStart(text: string, at: number): boolean {
  return at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]!);
}

/**
 * Lowercase without accents, one character for one, so an index into
 * the folded text is an index into the label.
 */
function fold(text: string): string {
  let out = '';
  for (const char of text) {
    const folded = char
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '');
    // A character that folds to more than one (or to none) keeps one place.
    out += folded.length === 1 ? folded : char.length === 1 ? (folded[0] ?? char) : char;
  }
  return out;
}

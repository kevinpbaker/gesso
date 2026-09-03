import { describe, expect, it } from 'vitest';

import { segmentParagraph } from './LineBreaks';

/** The segments as strings, so a wrong boundary reads as a wrong word. */
function segments(text: string, wrap: 'word' | 'char' | 'none' = 'word'): string[] {
  return segmentParagraph(text, wrap).map(segment => text.slice(segment.start, segment.end));
}

describe('segmentParagraph', () => {
  it('splits at blanks and leaves the blanks out', () => {
    expect(segments('one  two\tthree ')).toEqual(['one', 'two', 'three']);
    expect(segments('   ')).toEqual([]);
    expect(segments('')).toEqual([]);
  });

  it('breaks after a hyphen between letters, keeping the hyphen on the line', () => {
    expect(segments('over-the-counter')).toEqual(['over-', 'the-', 'counter']);
    expect(segments('-verbose')).toEqual(['-', 'verbose']);
  });

  it('does not break a hyphen from a following digit, dash or closing punctuation', () => {
    expect(segments('10-15 -5')).toEqual(['10-15', '-5']);
    expect(segments('a--b')).toEqual(['a--', 'b']);
    expect(segments('(re-) x')).toEqual(['(re-)', 'x']);
  });

  it('breaks after en dashes and hyphens but never a non-breaking hyphen', () => {
    expect(segments('10–15')).toEqual(['10–', '15']);
    expect(segments('non‑breaking')).toEqual(['non‑breaking']);
  });

  it('breaks on both sides of an em dash but not between two', () => {
    expect(segments('fox—jumps')).toEqual(['fox', '—', 'jumps']);
    expect(segments('wait——what')).toEqual(['wait', '——', 'what']);
    expect(segments('(—aside')).toEqual(['(—', 'aside']);
  });

  it('breaks after a zero-width space', () => {
    expect(segments('alpha​beta')).toEqual(['alpha​', 'beta']);
  });

  it('keeps a non-breaking space and a soft hyphen inside their word', () => {
    expect(segments('a b c')).toEqual(['a b', 'c']);
    expect(segments('su­per')).toEqual(['su­per']);
  });

  it('never breaks inside a grapheme cluster', () => {
    expect(segments('éx', 'char')).toEqual(['é', 'x']);
    expect(segments('\u{1f600}\u{1f601}', 'char')).toEqual(['\u{1f600}', '\u{1f601}']);
    expect(segments('café-bar')).toEqual(['café-', 'bar']);
  });

  it("treats 'char' as a break between every cluster and 'none' as no break at all", () => {
    expect(segments('ab cd', 'char')).toEqual(['a', 'b', 'c', 'd']);
    expect(segments('ab cd', 'none')).toEqual(['ab cd']);
  });
});

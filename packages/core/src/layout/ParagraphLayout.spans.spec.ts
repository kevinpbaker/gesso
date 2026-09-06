import { describe, expect, it } from 'vitest';

import { layoutParagraph } from './ParagraphLayout';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import type { TextLineRun, TextMeasureRequest, TextRunSpan } from './TextMeasurer';

/**
 * Runs inside the paragraph algorithm.
 *
 * The measurer is the deterministic one, so a glyph is `0.6em` wide
 * and a run at twice the size is exactly twice as wide per character:
 * every width below is arithmetic rather than a font's opinion.
 *
 * What these assert is the property the whole feature rests on: the
 * text is one string, so a line's offsets, a break, an ellipsis and a
 * hanging space mean what they meant before runs existed, and the runs
 * only decide what each stretch was measured in.
 */
const runs = new CharacterCountTextMeasurer();

function layout(text: string, spans: readonly TextRunSpan[], request: Partial<TextMeasureRequest> = {}) {
  return layoutParagraph({ text, fontSize: 10, spans, ...request }, runs);
}

function shapeOf(line: readonly TextLineRun[] | undefined): [number, string, number, number][] {
  return (line ?? []).map(run => [run.span, run.text, run.x, run.width]);
}

describe('layoutParagraph with runs', () => {
  it('measures each run in its own font', () => {
    // 'ab' at 10px is 12 wide; 'cd' at 20px is 24.
    const paragraph = layout('abcd', [{ start: 2, end: 4, fontSize: 20 }]);
    expect(paragraph.lines[0].width).toBe(36);
    expect(paragraph.maxContentWidth).toBe(36);
  });

  it('cuts each line at the run boundaries, with each piece placed', () => {
    const paragraph = layout('abcd', [{ start: 2, end: 4, fontSize: 20 }]);
    expect(shapeOf(paragraph.lines[0].runs)).toEqual([
      [-1, 'ab', 0, 12],
      [0, 'cd', 12, 24]
    ]);
  });

  it('breaks against the widths the runs were measured at', () => {
    // 'aa' is 12 wide, 'bb' at 20px is 24, and a space is 6: the two
    // together need 42, so a 40px box breaks between them.
    const paragraph = layout('aa bb', [{ start: 3, end: 5, fontSize: 20 }], { maxWidth: 40 });
    expect(paragraph.lines.map(line => line.text)).toEqual(['aa', 'bb']);
    expect(paragraph.lines[1].start).toBe(3);
  });

  it('measures a hanging space in the run it falls in', () => {
    // The space at offset 2 is inside the 20px run, so it hangs at 12
    // rather than 6 and the first line is 'aa' alone in a 24px box.
    const paragraph = layout('aa bb', [{ start: 2, end: 5, fontSize: 20 }], { maxWidth: 24 });
    expect(paragraph.lines.map(line => line.text)).toEqual(['aa', 'bb']);
    expect(paragraph.lines[0].width).toBe(12);
  });

  it('keeps offsets in the source text across runs and lines', () => {
    const paragraph = layout('one two three', [{ start: 4, end: 7, fontWeight: 'bold' }], { maxWidth: 48 });
    expect(paragraph.lines.map(line => [line.start, line.end, line.text])).toEqual([
      [0, 7, 'one two'],
      [8, 13, 'three']
    ]);
    expect(shapeOf(paragraph.lines[0].runs)).toEqual([
      [-1, 'one ', 0, 24],
      [0, 'two', 24, 18]
    ]);
  });

  it('ends a clamped line with an ellipsis in the last run it kept', () => {
    const paragraph = layout('abcdefgh', [{ start: 4, end: 8, fontSize: 20 }], {
      maxWidth: 40,
      wrap: 'none',
      overflow: 'ellipsis'
    });
    const line = paragraph.lines[0];
    expect(line.text.endsWith('…')).toBe(true);
    expect(line.width).toBeLessThanOrEqual(40);
    // The ellipsis is drawn as part of the run it follows, so it is
    // the last piece's text rather than a piece of its own.
    const last = line.runs![line.runs!.length - 1];
    expect(last.text.endsWith('…')).toBe(true);
    expect(last.x + last.width).toBeCloseTo(line.width, 5);
  });

  it('is exactly the unspanned layout when no run changes the font', () => {
    const plain = layoutParagraph({ text: 'one two three', fontSize: 10, maxWidth: 48 }, runs);
    const spanned = layout('one two three', [{ start: 4, end: 7 }], { maxWidth: 48 });
    expect(spanned.lines.map(line => line.text)).toEqual(plain.lines.map(line => line.text));
    expect(spanned.width).toBe(plain.width);
    expect(spanned.height).toBe(plain.height);
    expect(spanned.firstBaseline).toBe(plain.firstBaseline);
  });

  describe('the line box', () => {
    it('is the requested line height when every run shares the font', () => {
      const paragraph = layout('abcd', [{ start: 2, end: 4 }], { lineHeight: 20 });
      expect(paragraph.lineHeight).toBe(20);
      // 8 of ascent below 5 of half-leading, as it is with no runs.
      expect(paragraph.firstBaseline).toBe(13);
    });

    it('grows around a run whose font does not fit the line, as CSS stacks inline boxes', () => {
      // A 20px run is 16 above the baseline and 4 below; the 12px line
      // height it inherits gives it a half-leading of -4, so its box
      // reaches 12 above the baseline and 0 below. The paragraph's own
      // font reaches 9 above and 3 below. The line is the union: 12
      // above, 3 below, 15 tall, which is what Chrome makes of the
      // same two inline boxes.
      const paragraph = layout('abcd', [{ start: 2, end: 4, fontSize: 20 }], { lineHeight: 12 });
      expect(paragraph.ascent).toBe(16);
      expect(paragraph.descent).toBe(4);
      expect(paragraph.firstBaseline).toBe(12);
      expect(paragraph.lineHeight).toBe(15);
      expect(paragraph.height).toBe(15);
    });

    it('gives every line the tallest line box', () => {
      const paragraph = layout('ab\ncd', [{ start: 3, end: 5, fontSize: 20 }], { lineHeight: 12 });
      expect(paragraph.lines).toHaveLength(2);
      expect(paragraph.height).toBe(paragraph.lineHeight * 2);
    });
  });
});

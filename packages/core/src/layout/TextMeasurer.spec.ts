import { describe, expect, it } from 'vitest';

import { CharacterCountTextMeasurer, layoutFitsAnyWidth } from './TextMeasurer';
import type { TextMeasureRequest } from './TextMeasurer';

describe('CharacterCountTextMeasurer', () => {
  it('sizes text by character count and font size', () => {
    const measurer = new CharacterCountTextMeasurer();
    const size = measurer.measure({ text: 'Hello', fontSize: 10 });
    expect(size.width).toBe(30);
    expect(size.height).toBe(12);
  });

  it('gives empty text one empty line', () => {
    const measurer = new CharacterCountTextMeasurer();
    const size = measurer.measure({ text: '', fontSize: 10 });
    expect(size.width).toBe(0);
    expect(size.height).toBe(12);
  });

  it('wraps at spaces to fit maxWidth', () => {
    const measurer = new CharacterCountTextMeasurer();
    const size = measurer.measure({ text: 'ab cd', fontSize: 10, maxWidth: 20 });
    expect(size.width).toBe(20);
    expect(size.height).toBe(24);
  });

  it('keeps an unbreakable word at its own width', () => {
    // CSS fit-content: never narrower than the widest unbreakable segment.
    const measurer = new CharacterCountTextMeasurer();
    const size = measurer.measure({ text: 'Hello', fontSize: 10, maxWidth: 20 });
    expect(size.width).toBe(30);
    expect(size.height).toBe(12);
  });

  it('honours the line height when given', () => {
    const measurer = new CharacterCountTextMeasurer();
    expect(measurer.measure({ text: 'x', fontSize: 10, lineHeight: 20 }).height).toBe(20);
  });

  it('reports font metrics proportional to the font size', () => {
    const measurer = new CharacterCountTextMeasurer();
    const paragraph = measurer.layout({ text: 'x', fontSize: 10 });
    expect(paragraph.ascent).toBe(8);
    expect(paragraph.descent).toBe(2);
    expect(paragraph.firstBaseline).toBe(9);
  });

  it('can reproduce the Ahem test font with 1em glyphs', () => {
    const measurer = new CharacterCountTextMeasurer({ glyphWidth: 1 });
    expect(measurer.measure({ text: 'abcde', fontSize: 10 }).width).toBe(50);
  });

  it('counts code points, not UTF-16 units', () => {
    const measurer = new CharacterCountTextMeasurer();
    expect(measurer.measure({ text: '😀', fontSize: 10 }).width).toBe(6);
  });
});

describe('ParagraphTextMeasurer', () => {
  /** Counts how often the primitive is asked, which is how often a paragraph is actually laid out. */
  class CountingMeasurer extends CharacterCountTextMeasurer {
    runs = 0;
    override measureRunWidth(text: string, request: { fontSize: number }): number {
      this.runs++;
      return super.measureRunWidth(text, request as Parameters<CharacterCountTextMeasurer['measureRunWidth']>[1]);
    }
  }

  it('lays a paragraph out once per distinct request and hands the same result back after that', () => {
    const measurer = new CountingMeasurer();
    const request = { text: 'the quick brown fox jumps over the lazy dog', fontSize: 10, maxWidth: 100 };
    const first = measurer.layout(request);
    const runs = measurer.runs;
    expect(runs).toBeGreaterThan(0);
    expect(measurer.layout({ ...request })).toBe(first);
    expect(measurer.runs).toBe(runs);
    // Any field that could change the lines is part of the key.
    measurer.layout({ ...request, maxWidth: 60 });
    measurer.layout({ ...request, maxLines: 1, overflow: 'ellipsis' });
    measurer.layout({ ...request, text: `${request.text}!` });
    expect(measurer.runs).toBeGreaterThan(runs);
  });

  it('forgets everything on invalidate, and the oldest paragraph once the cap is reached', () => {
    const measurer = new CountingMeasurer();
    measurer.layout({ text: 'a', fontSize: 10 });
    const runs = measurer.runs;
    measurer.invalidate();
    measurer.layout({ text: 'a', fontSize: 10 });
    expect(measurer.runs).toBeGreaterThan(runs);
    for (let n = 0; n < 4200; n++) {
      measurer.layout({ text: `row ${n}`, fontSize: 10 });
    }
    expect(measurer.cachedParagraphs).toBe(4096);
    const before = measurer.runs;
    const kept = measurer.layout({ text: 'row 4199', fontSize: 10 });
    expect(measurer.runs).toBe(before);
    // The oldest paragraph was forgotten, so it is laid out again and is
    // a new object. Its one line's widths are still remembered by the
    // hard-line memo, so laying it out again measures nothing.
    const again = measurer.layout({ text: 'row 0', fontSize: 10 });
    expect(again).not.toBe(kept);
    expect(again.lines.map(line => line.text)).toEqual(['row 0']);
    expect(measurer.runs).toBe(before);
    // And invalidate forgets those as well, as a font arriving needs.
    measurer.invalidate();
    measurer.layout({ text: 'row 0', fontSize: 10 });
    expect(measurer.runs).toBeGreaterThan(before);
  });

  it('re-breaks only the hard line an edit changed', () => {
    const measurer = new CountingMeasurer();
    const lines = Array.from({ length: 500 }, (_, i) => `Line ${i} of a long field`);
    measurer.layout({ text: lines.join('\n'), fontSize: 10, maxWidth: 80 });
    const before = measurer.runs;
    lines[250] = 'Line 250 of a long field, edited';
    const edited = measurer.layout({ text: lines.join('\n'), fontSize: 10, maxWidth: 80 });
    // A handful of measurements for the one changed line, not thousands.
    expect(measurer.runs - before).toBeLessThan(20);
    // And the result is the result a cold measurer gives.
    const cold = new CountingMeasurer().layout({ text: lines.join('\n'), fontSize: 10, maxWidth: 80 });
    expect(edited.lines).toEqual(cold.lines);
    expect([edited.width, edited.height, edited.minContentWidth, edited.maxContentWidth]).toEqual([
      cold.width,
      cold.height,
      cold.minContentWidth,
      cold.maxContentWidth
    ]);
  });
});

/**
 * A paragraph that fits is handed out at other widths without being
 * laid out again, by the measurer and by the layout engine's per-node
 * memo. That is only sound if laying it out again would have produced
 * the same thing, so this does lay it out again, in a measurer that has
 * never seen it, at every width it is reused at, over the shapes most
 * likely to tell two widths apart: hanging and leading blanks, hard
 * lines, a line limit with and without an ellipsis, runs in other
 * fonts, and a box that is exact.
 */
describe('a paragraph that fits at any width', () => {
  const texts = [
    'Track number 1',
    'trailing blanks   ',
    '   leading blanks',
    'two\nhard lines',
    'three\nhard\nlines',
    '',
    'a',
    '\n',
    'mixed\tblank and　ideographic'
  ];
  const variants: Partial<TextMeasureRequest>[] = [
    {},
    { exactWidth: true },
    { wrap: 'none' },
    { wrap: 'char' },
    { maxLines: 1 },
    { maxLines: 1, overflow: 'ellipsis' },
    { maxLines: 2, overflow: 'ellipsis' },
    { overflow: 'ellipsis' },
    { letterSpacing: 1.5 },
    { spans: [{ start: 0, end: 3, fontSize: 20 }] },
    { spans: [{ start: 1, end: 4, hidden: true }] }
  ];

  it('is laid out the same at every wider width it is handed out at', () => {
    const measurer = new CharacterCountTextMeasurer();
    let reused = 0;
    for (const text of texts) {
      for (const variant of variants) {
        const base: TextMeasureRequest = { text, fontSize: 10, ...variant };
        const natural = measurer.layout(base).maxContentWidth;
        for (const at of [natural, natural + 0.25, natural + 37]) {
          const first = { ...base, maxWidth: at };
          const paragraph = measurer.layout(first);
          if (!layoutFitsAnyWidth(first, paragraph)) {
            continue;
          }
          for (const later of [natural, natural + 1 / 128, natural + 5, natural + 400]) {
            for (const exactWidth of [false, true]) {
              const request = { ...base, maxWidth: later, exactWidth };
              const fresh = new CharacterCountTextMeasurer().layout(request);
              expect(fresh, `${JSON.stringify(text)} ${JSON.stringify(variant)} ${at} → ${later}`).toEqual(paragraph);
              expect(measurer.layout(request)).toEqual(fresh);
              reused++;
            }
          }
        }
      }
    }
    // Every shape but the cut one fits, so this is not vacuous.
    expect(reused).toBeGreaterThan(500);
  });

  it('is not handed out narrower than its natural width', () => {
    const measurer = new CharacterCountTextMeasurer();
    const request: TextMeasureRequest = { text: 'Track number 1', fontSize: 10, maxWidth: 400 };
    const wide = measurer.layout(request);
    expect(layoutFitsAnyWidth(request, wide)).toBe(true);
    const narrow = measurer.layout({ ...request, maxWidth: wide.maxContentWidth - 1 });
    expect(narrow).not.toBe(wide);
    expect(narrow.lines.length).toBe(2);
  });

  it('does not count a paragraph cut short by an ellipsised line limit as fitting', () => {
    const measurer = new CharacterCountTextMeasurer();
    const request: TextMeasureRequest = {
      text: 'one\ntwo\nthree',
      fontSize: 10,
      maxWidth: 400,
      maxLines: 2,
      overflow: 'ellipsis'
    };
    expect(layoutFitsAnyWidth(request, measurer.layout(request))).toBe(false);
  });
});

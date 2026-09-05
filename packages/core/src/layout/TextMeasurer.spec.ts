import { describe, expect, it } from 'vitest';

import { CharacterCountTextMeasurer } from './TextMeasurer';

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
    measurer.layout({ text: 'row 4199', fontSize: 10 });
    expect(measurer.runs).toBe(before);
    measurer.layout({ text: 'row 0', fontSize: 10 });
    expect(measurer.runs).toBeGreaterThan(before);
  });
});

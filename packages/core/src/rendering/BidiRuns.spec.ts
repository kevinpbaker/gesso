import { describe, expect, it } from 'vitest';

import { needsVisualOrder, visualOrder } from './BidiRuns';

const words = (text: string, rtl: boolean) =>
  visualOrder(text, rtl)
    .filter(token => !token.blank)
    .map(token => token.text);

describe('visualOrder', () => {
  it('leaves a left-to-right line alone', () => {
    expect(words('the quick fox', false)).toEqual(['the', 'quick', 'fox']);
    expect(needsVisualOrder('the quick fox', false)).toBe(false);
  });

  it('reverses the words of a right-to-left line', () => {
    expect(words('السلام عليكم ورحمة', true)).toEqual(['ورحمة', 'عليكم', 'السلام']);
    expect(needsVisualOrder('السلام', false)).toBe(true);
  });

  it('keeps a number and a Latin word as units inside Arabic, in the sentence order read right to left', () => {
    // Read from the right: الطلب رقم 1024 وصل. Drawn from the left: وصل 1024 رقم الطلب.
    expect(words('الطلب رقم 1024 وصل', true)).toEqual(['وصل', '1024', 'رقم', 'الطلب']);
    expect(words('استخدم Gesso للواجهة', true)).toEqual(['للواجهة', 'Gesso', 'استخدم']);
  });

  it('keeps two adjacent left-to-right words in their own order inside a right-to-left line', () => {
    expect(words('قال hello world ثم', true)).toEqual(['ثم', 'hello', 'world', 'قال']);
  });

  it('places an Arabic run as a unit inside a left-to-right line', () => {
    expect(words('Hello مرحبا بالعالم world', false)).toEqual(['Hello', 'بالعالم', 'مرحبا', 'world']);
  });

  it('puts neutral punctuation at a right-to-left line end on the left', () => {
    expect(words('مرحبا، كيف حالك؟', true)).toEqual(['حالك؟', 'كيف', 'مرحبا،']);
    expect(words('Hello!', true)).toEqual(['Hello!']);
  });

  it('keeps a Hebrew line with a number readable', () => {
    expect(words('הזמנה מספר 42 הגיעה', true)).toEqual(['הגיעה', '42', 'מספר', 'הזמנה']);
  });

  it('reports offsets into the logical text', () => {
    const tokens = visualOrder('ab cd', true);
    expect(tokens.map(token => [token.start, token.end])).toEqual([
      [0, 2],
      [2, 3],
      [3, 5]
    ]);
  });
});

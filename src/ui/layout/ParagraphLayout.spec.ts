import { describe, expect, it } from 'vitest';

import { layoutParagraph } from './ParagraphLayout';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import type { TextMeasureRequest } from './TextMeasurer';

/** 10px font: every glyph 6px wide, lines 12px tall, baseline at 9px. */
const runs = new CharacterCountTextMeasurer();

function layout(text: string, request: Partial<TextMeasureRequest> = {}) {
  return layoutParagraph({ text, fontSize: 10, ...request }, runs);
}

function lines(text: string, request: Partial<TextMeasureRequest> = {}): string[] {
  return layout(text, request).lines.map(line => line.text);
}

describe('layoutParagraph', () => {
  describe('word wrapping', () => {
    it('keeps text on one line when it fits', () => {
      expect(lines('ab cd', { maxWidth: 30 })).toEqual(['ab cd']);
    });

    it('breaks at spaces, greedily', () => {
      expect(lines('ab cd ef gh', { maxWidth: 30 })).toEqual(['ab cd', 'ef gh']);
      expect(lines('ab cd ef gh', { maxWidth: 40 })).toEqual(['ab cd', 'ef gh']);
      expect(lines('ab cd ef gh', { maxWidth: 48 })).toEqual(['ab cd ef', 'gh']);
    });

    it('lets spaces at a break hang instead of counting them', () => {
      // 'ab cd' is exactly 30 wide; the following space must not push
      // it over.
      const paragraph = layout('ab cd ef', { maxWidth: 30 });
      expect(paragraph.lines.map(line => line.text)).toEqual(['ab cd', 'ef']);
      expect(paragraph.lines[0].width).toBe(30);
      expect(paragraph.lines[0].end).toBe(5);
      expect(paragraph.lines[1].start).toBe(6);
    });

    it('puts a word wider than the box on its own line and lets it overflow', () => {
      const paragraph = layout('abcdefgh ij', { maxWidth: 30 });
      expect(paragraph.lines.map(line => line.text)).toEqual(['abcdefgh', 'ij']);
      expect(paragraph.lines[0].width).toBe(48);
      expect(paragraph.width).toBe(48);
    });

    it('collapses runs of spaces at breaks and ignores leading spaces on new lines', () => {
      expect(lines('ab   cd', { maxWidth: 12 })).toEqual(['ab', 'cd']);
    });
  });

  describe('character wrapping', () => {
    it('breaks between any two characters', () => {
      expect(lines('abcdefg', { maxWidth: 18, wrap: 'char' })).toEqual(['abc', 'def', 'g']);
    });

    it('still lets spaces hang', () => {
      expect(lines('ab cd', { maxWidth: 12, wrap: 'char' })).toEqual(['ab', 'cd']);
    });

    it('keeps surrogate pairs together', () => {
      expect(lines('a😀b', { maxWidth: 6, wrap: 'char' })).toEqual(['a', '😀', 'b']);
    });
  });

  describe('no wrapping', () => {
    it('breaks only at newlines', () => {
      expect(lines('ab cd ef', { maxWidth: 12, wrap: 'none' })).toEqual(['ab cd ef']);
      expect(lines('ab\ncd ef', { maxWidth: 12, wrap: 'none' })).toEqual(['ab', 'cd ef']);
    });
  });

  describe('hard breaks', () => {
    it('splits on newlines and keeps blank lines', () => {
      expect(lines('ab\n\ncd')).toEqual(['ab', '', 'cd']);
      expect(layout('ab\n\ncd').height).toBe(36);
    });

    it('gives empty text a single empty line', () => {
      const paragraph = layout('');
      expect(paragraph.lines).toEqual([{ start: 0, end: 0, text: '', width: 0 }]);
      expect(paragraph.height).toBe(12);
    });

    it('wraps each paragraph independently', () => {
      expect(lines('ab cd\nef gh', { maxWidth: 12 })).toEqual(['ab', 'cd', 'ef', 'gh']);
    });
  });

  describe('maxLines and ellipsis', () => {
    it('drops lines beyond maxLines', () => {
      const paragraph = layout('ab cd ef gh', { maxWidth: 12, maxLines: 2 });
      expect(paragraph.lines.map(line => line.text)).toEqual(['ab', 'cd']);
      expect(paragraph.height).toBe(24);
    });

    it('ellipsises the last kept line so it fits', () => {
      expect(lines('abcd efgh ijkl', { maxWidth: 60, maxLines: 1, overflow: 'ellipsis' })).toEqual(['abcd efgh…']);
      expect(lines('abcd efgh ijkl', { maxWidth: 30, maxLines: 1, overflow: 'ellipsis' })).toEqual(['abcd…']);
    });

    it('drops trailing spaces before the ellipsis', () => {
      expect(lines('ab cd', { maxWidth: 24, wrap: 'none', overflow: 'ellipsis' })).toEqual(['ab…']);
    });

    it('ellipsises an unwrapped line that overflows', () => {
      expect(lines('abcdefgh', { maxWidth: 30, wrap: 'none', overflow: 'ellipsis' })).toEqual(['abcd…']);
    });

    it('ellipsises an unbreakable word that overflows', () => {
      expect(lines('abcdefgh ij', { maxWidth: 30, overflow: 'ellipsis' })).toEqual(['abcd…', 'ij']);
    });

    it('keeps the source offsets of the retained text', () => {
      const [line] = layout('abcd efgh ijkl', { maxWidth: 30, maxLines: 1, overflow: 'ellipsis' }).lines;
      expect(line.start).toBe(0);
      expect(line.end).toBe(4);
    });

    it('leaves a fitting line alone', () => {
      expect(lines('ab', { maxWidth: 30, overflow: 'ellipsis' })).toEqual(['ab']);
    });
  });

  describe('sizes', () => {
    it('reports max-content and min-content widths', () => {
      const paragraph = layout('ab cdef g', { maxWidth: 30 });
      expect(paragraph.maxContentWidth).toBe(54);
      expect(paragraph.minContentWidth).toBe(24);
    });

    it('reports one character as min-content under char wrapping', () => {
      expect(layout('abcd', { wrap: 'char' }).minContentWidth).toBe(6);
    });

    it('reports the whole line as min-content when not wrapping', () => {
      expect(layout('ab cd', { wrap: 'none' }).minContentWidth).toBe(30);
    });

    it('is fit-content wide: the available width once wrapping happened', () => {
      expect(layout('ab cd ef', { maxWidth: 40 }).width).toBe(40);
      expect(layout('ab cd ef', { maxWidth: 100 }).width).toBe(48);
      expect(layout('ab cd ef').width).toBe(48);
    });

    it('derives the first baseline from half-leading and ascent', () => {
      expect(layout('x').firstBaseline).toBe(9);
      expect(layout('x', { lineHeight: 20 }).firstBaseline).toBe(13);
    });

    it('falls back to 1.2× the font size for the line height', () => {
      expect(layout('x').lineHeight).toBe(12);
      expect(layout('x', { lineHeight: 0 }).lineHeight).toBe(12);
    });
  });
});

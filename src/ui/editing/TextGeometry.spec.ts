import { describe, expect, it } from 'vitest';

import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import { createPaintState } from '../rendering/PaintState';
import { EditableTextModel } from './EditableTextModel';
import { EditableLayout } from './EditableLayout';
import { graphemeBoundaries, nextWordEnd, previousWordStart, wordRangeAt } from './TextBoundaries';
import {
  caretRectFor,
  lineIndexForOffset,
  offsetAtPoint,
  offsetForVerticalMove,
  selectionRects,
  type PlacedLine
} from './TextGeometry';

/** 10px glyphs, 12px lines: 'hello world' wrapped at 60px gives 'hello' / 'world'. */
const measure = (text: string): number => text.length * 10;

const TEXT = 'hello world';

const wrapped: PlacedLine[] = [
  { text: 'hello', start: 0, end: 5, x: 0, y: 0, width: 50, height: 12 },
  { text: 'world', start: 6, end: 11, x: 0, y: 12, width: 50, height: 12 }
];

describe('TextGeometry', () => {
  describe('lineIndexForOffset', () => {
    it('gives a hanging space to the line before the break', () => {
      expect(lineIndexForOffset(wrapped, 0)).toBe(0);
      expect(lineIndexForOffset(wrapped, 5)).toBe(0);
      expect(lineIndexForOffset(wrapped, 6)).toBe(1);
      expect(lineIndexForOffset(wrapped, 11)).toBe(1);
    });
  });

  describe('caretRectFor', () => {
    it('is the prefix width from the line start', () => {
      expect(caretRectFor(wrapped, TEXT, 3, measure, false)).toEqual({ x: 30, y: 0, height: 12, line: 0 });
      expect(caretRectFor(wrapped, TEXT, 8, measure, false)).toEqual({ x: 20, y: 12, height: 12, line: 1 });
    });

    it('clamps a hanging-space caret to the line end', () => {
      expect(caretRectFor(wrapped, TEXT, 5, measure, false).x).toBe(50);
    });

    it('mirrors from the right edge in rtl', () => {
      expect(caretRectFor(wrapped, TEXT, 0, measure, true).x).toBe(50);
      expect(caretRectFor(wrapped, TEXT, 2, measure, true).x).toBe(30);
    });
  });

  describe('offsetAtPoint', () => {
    it('finds the nearest boundary on the line under the point', () => {
      expect(offsetAtPoint(wrapped, TEXT, 0, 5, measure, false)).toBe(0);
      expect(offsetAtPoint(wrapped, TEXT, 14, 5, measure, false)).toBe(1);
      expect(offsetAtPoint(wrapped, TEXT, 16, 5, measure, false)).toBe(2);
      expect(offsetAtPoint(wrapped, TEXT, 24, 15, measure, false)).toBe(8);
    });

    it('clamps beyond the line ends and outside the lines vertically', () => {
      expect(offsetAtPoint(wrapped, TEXT, -10, 5, measure, false)).toBe(0);
      expect(offsetAtPoint(wrapped, TEXT, 500, 5, measure, false)).toBe(5);
      expect(offsetAtPoint(wrapped, TEXT, 10, -50, measure, false)).toBe(1);
      expect(offsetAtPoint(wrapped, TEXT, 10, 500, measure, false)).toBe(7);
    });

    it('never lands inside a grapheme', () => {
      const line: PlacedLine[] = [{ text: 'a😀b', start: 0, end: 4, x: 0, y: 0, width: 30, height: 12 }];
      expect(graphemeBoundaries('a😀b')).toEqual([0, 1, 3, 4]);
      expect(offsetAtPoint(line, 'a😀b', 14, 0, measure, false)).toBe(1);
      expect(offsetAtPoint(line, 'a😀b', 21, 0, measure, false)).toBe(3);
    });

    it('reads x from the right in rtl', () => {
      expect(offsetAtPoint(wrapped, TEXT, 50, 5, measure, true)).toBe(0);
      expect(offsetAtPoint(wrapped, TEXT, 30, 5, measure, true)).toBe(2);
    });
  });

  describe('offsetForVerticalMove', () => {
    it('keeps the x across lines and reports the edge', () => {
      const down = offsetForVerticalMove(wrapped, TEXT, 3, 1, measure, false);
      expect(down).toEqual({ offset: 9, x: 30 });
      expect(offsetForVerticalMove(wrapped, TEXT, 9, 1, measure, false)).toBeNull();
      expect(offsetForVerticalMove(wrapped, TEXT, 9, -1, measure, false, 47)).toEqual({ offset: 5, x: 47 });
    });
  });

  describe('hanging spaces', () => {
    // 'ab  ' has two trailing spaces the layout leaves out of the line.
    const trailing: PlacedLine[] = [{ text: 'ab', start: 0, end: 2, x: 0, y: 0, width: 20, height: 12 }];

    it('moves the caret through trailing spaces at the end of the text', () => {
      expect(caretRectFor(trailing, 'ab  ', 2, measure, false).x).toBe(20);
      expect(caretRectFor(trailing, 'ab  ', 3, measure, false).x).toBe(30);
      expect(caretRectFor(trailing, 'ab  ', 4, measure, false).x).toBe(40);
    });

    it('lets a click past the text land after the trailing spaces', () => {
      expect(offsetAtPoint(trailing, 'ab  ', 35, 0, measure, false)).toBe(4);
      expect(offsetAtPoint(trailing, 'ab  ', 26, 0, measure, false)).toBe(3);
    });

    it('highlights selected trailing spaces', () => {
      expect(selectionRects(trailing, 'ab  ', 1, 4, measure, false)).toEqual([{ x: 10, y: 0, width: 30, height: 12 }]);
    });

    it("draws the caret in a wrap's hanging spaces but stops a click before the break", () => {
      // 'hello   world' wrapped after 'hello': three hanging spaces.
      const text = 'hello   world';
      const lines: PlacedLine[] = [
        { text: 'hello', start: 0, end: 5, x: 0, y: 0, width: 50, height: 12 },
        { text: 'world', start: 8, end: 13, x: 0, y: 12, width: 50, height: 12 }
      ];
      expect(caretRectFor(lines, text, 7, measure, false)).toMatchObject({ x: 70, line: 0 });
      expect(offsetAtPoint(lines, text, 200, 5, measure, false)).toBe(5);
      expect(caretRectFor(lines, text, 8, measure, false)).toMatchObject({ x: 0, line: 1 });
    });

    it('stops at the newline of a hard break', () => {
      const text = 'ab \ncd';
      const lines: PlacedLine[] = [
        { text: 'ab', start: 0, end: 2, x: 0, y: 0, width: 20, height: 12 },
        { text: 'cd', start: 4, end: 6, x: 0, y: 12, width: 20, height: 12 }
      ];
      expect(caretRectFor(lines, text, 3, measure, false).x).toBe(30);
      expect(selectionRects(lines, text, 0, 4, measure, false)[0].width).toBe(30);
    });
  });

  describe('selectionRects', () => {
    it('covers one box per line and marks a crossed line break', () => {
      expect(selectionRects(wrapped, TEXT, 2, 8, measure, false)).toEqual([
        { x: 20, y: 0, width: 40, height: 12 },
        { x: 0, y: 12, width: 20, height: 12 }
      ]);
    });

    it('is empty for a collapsed range', () => {
      expect(selectionRects(wrapped, TEXT, 3, 3, measure, false)).toEqual([]);
    });

    it('mirrors in rtl', () => {
      expect(selectionRects(wrapped, TEXT, 0, 2, measure, true)).toEqual([{ x: 30, y: 0, width: 20, height: 12 }]);
    });
  });
});

describe('TextBoundaries', () => {
  it('stops word moves at newlines', () => {
    expect(nextWordEnd('ab\ncd', 2)).toBe(3);
    expect(nextWordEnd('ab\ncd', 0)).toBe(2);
    expect(previousWordStart('ab\ncd', 3)).toBe(2);
  });

  it('selects the word or the run of spaces under a point', () => {
    expect(wordRangeAt('hello  world', 1)).toEqual({ start: 0, end: 5 });
    expect(wordRangeAt('hello  world', 8)).toEqual({ start: 7, end: 12 });
    expect(wordRangeAt('hello  world', 5)).toEqual({ start: 5, end: 7 });
    expect(wordRangeAt('', 0)).toEqual({ start: 0, end: 0 });
  });
});

describe('EditableLayout', () => {
  it('gives an empty field one line to put the caret on, sized by the font', () => {
    const measurer = new CharacterCountTextMeasurer({ glyphWidth: 1 });
    const state = createPaintState();
    state.fontSize = 10;
    state.lineHeight = 12;
    state.placeholder = 'Type here';
    const model = new EditableTextModel();
    const layout = new EditableLayout(model, { x: 5, y: 7, width: 200, height: 40 }, state, measurer);
    expect(layout.lines).toHaveLength(1);
    expect(layout.caretRect()).toEqual({ x: 5, y: 7, height: 12, line: 0 });
    expect(layout.placeholderLines.map(line => line.text)).toEqual(['Type here']);
  });

  it('centres the caret line with the text when the text is centred', () => {
    const measurer = new CharacterCountTextMeasurer({ glyphWidth: 1 });
    const state = createPaintState();
    state.fontSize = 10;
    state.textAlign = 'center';
    const model = new EditableTextModel('ab');
    model.select(2);
    const layout = new EditableLayout(model, { x: 0, y: 0, width: 100, height: 40 }, state, measurer);
    // The 20px line is centred at 40; the caret after 'ab' is at its end.
    expect(layout.caretRect().x).toBe(60);
    expect(layout.offsetAt(41, 0)).toBe(0);
  });

  it('wraps at the content width and never clamps or ellipsises', () => {
    const measurer = new CharacterCountTextMeasurer({ glyphWidth: 1 });
    const state = createPaintState();
    state.fontSize = 10;
    state.maxLines = 1;
    state.textOverflow = 'ellipsis';
    const model = new EditableTextModel('hello world again');
    const layout = new EditableLayout(model, { x: 0, y: 0, width: 60, height: 100 }, state, measurer);
    expect(layout.lines.map(line => line.text)).toEqual(['hello', 'world', 'again']);
  });
});

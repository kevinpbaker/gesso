import { describe, expect, it } from 'vitest';

import type { UiColor } from './UiColor';
import { colorToHex, colorToRgba, colorsEqual, normalizeColor, parseColor, rgb8, rgba } from './UiColor';

describe('UiColor', () => {
  describe('rgba', () => {
    it('creates a color with default opaque alpha', () => {
      expect(rgba(1, 0.5, 0)).toEqual({ r: 1, g: 0.5, b: 0, a: 1 });
    });

    it('creates a color with explicit alpha', () => {
      expect(rgba(1, 0.5, 0, 0.5)).toEqual({ r: 1, g: 0.5, b: 0, a: 0.5 });
    });
  });

  describe('rgb8', () => {
    it('converts 8-bit channels to floats', () => {
      expect(rgb8(255, 128, 0)).toEqual({ r: 1, g: 128 / 255, b: 0, a: 1 });
    });
  });

  describe('colorsEqual', () => {
    it('returns true for identical colors', () => {
      expect(colorsEqual(rgba(1, 0, 0), rgba(1, 0, 0))).toBe(true);
    });

    it('returns false for different colors', () => {
      expect(colorsEqual(rgba(1, 0, 0), rgba(0, 1, 0))).toBe(false);
    });

    it('treats nearly-equal floats as equal', () => {
      expect(colorsEqual(rgba(0.333333, 0, 0), rgba(0.333334, 0, 0))).toBe(true);
    });
  });

  describe('colorToHex', () => {
    it('emits short hex for shortenable opaque colors', () => {
      expect(colorToHex(rgba(1, 0, 0))).toBe('#f00');
      expect(colorToHex(rgba(0, 1, 0))).toBe('#0f0');
      expect(colorToHex(rgba(0, 0, 1))).toBe('#00f');
      expect(colorToHex(rgba(0.2, 0.4, 0.6))).toBe('#369');
    });

    it('emits full hex for non-shortenable opaque colors', () => {
      expect(colorToHex(rgba(0.13, 0.59, 0.95))).toBe('#2196f2');
    });

    it('emits hex with alpha for transparent colors', () => {
      expect(colorToHex(rgba(1, 0, 0, 0.5))).toBe('#ff000080');
    });
  });

  describe('colorToRgba', () => {
    it('emits a CSS rgba string', () => {
      expect(colorToRgba(rgba(1, 0, 0, 0.5))).toBe('rgba(255, 0, 0, 0.5)');
    });
  });

  describe('parseColor', () => {
    it('parses hex strings', () => {
      expect(parseColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
      expect(parseColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
      expect(parseColor('#ff000080')).toEqual({ r: 1, g: 0, b: 0, a: 128 / 255 });
    });

    it('parses rgb and rgba strings', () => {
      expect(parseColor('rgb(255, 128, 0)')).toEqual({ r: 1, g: 128 / 255, b: 0, a: 1 });
      expect(parseColor('rgba(255, 128, 0, 0.5)')).toEqual({ r: 1, g: 128 / 255, b: 0, a: 0.5 });
    });

    it('parses named colors', () => {
      expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
      expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    it('returns undefined for unsupported values', () => {
      expect(parseColor('hsl(0, 100%, 50%)')).toBeUndefined();
      expect(parseColor('')).toBeUndefined();
    });
  });

  describe('parseColor memoization', () => {
    it('returns the same instance for repeated input', () => {
      expect(parseColor('#123456')).toBe(parseColor('#123456'));
    });

    it('keeps returning undefined for an unsupported value', () => {
      expect(parseColor('hsl(200, 50%, 50%)')).toBeUndefined();
      expect(parseColor('hsl(200, 50%, 50%)')).toBeUndefined();
    });

    it('does not confuse an unsupported value with transparent', () => {
      expect(parseColor('not-a-color')).toBeUndefined();
      expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
      expect(parseColor('not-a-color')).toBeUndefined();
    });

    it('still parses correctly once entries have been evicted', () => {
      const first = '#010203';
      expect(parseColor(first)).toEqual({ r: 1 / 255, g: 2 / 255, b: 3 / 255, a: 1 });

      // Push well past the cache limit with distinct strings, which
      // forces at least one wholesale clear.
      for (let i = 0; i < 600; i++) {
        expect(parseColor(`rgb(${i % 256}, ${(i * 3) % 256}, 0)`)).toEqual({
          r: (i % 256) / 255,
          g: ((i * 3) % 256) / 255,
          b: 0,
          a: 1
        });
      }

      expect(parseColor(first)).toEqual({ r: 1 / 255, g: 2 / 255, b: 3 / 255, a: 1 });
    });
  });

  describe('color formatting memoization', () => {
    it('returns the same hex string for a repeated instance', () => {
      const color = parseColor('#2196f2') as UiColor;
      expect(colorToHex(color)).toBe('#2196f2');
      expect(colorToHex(color)).toBe('#2196f2');
    });

    it('formats distinct instances independently', () => {
      const a = rgba(1, 0, 0, 0.5);
      const b = rgba(0, 0, 1);
      expect(colorToHex(a)).toBe('#ff000080');
      expect(colorToHex(b)).toBe('#00f');
      expect(colorToRgba(a)).toBe('rgba(255, 0, 0, 0.5)');
      expect(colorToRgba(b)).toBe('rgba(0, 0, 255, 1)');
    });
  });

  describe('normalizeColor', () => {
    it('passes UiColor objects through unchanged', () => {
      const color = rgba(1, 0, 0);
      expect(normalizeColor(color)).toBe(color);
    });

    it('parses string colors', () => {
      expect(normalizeColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    });

    it('returns undefined for invalid values', () => {
      expect(normalizeColor(undefined)).toBeUndefined();
      expect(normalizeColor(42)).toBeUndefined();
    });
  });
});

import { describe, expect, it } from 'vitest';

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

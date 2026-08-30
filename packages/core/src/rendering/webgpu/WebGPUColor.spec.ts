import { describe, expect, it } from 'vitest';
import { parseColor } from './WebGPUColor';

describe('parseColor', () => {
  it('parses hex shorthand', () => {
    expect(parseColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it('parses full hex', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it('parses hex with alpha', () => {
    expect(parseColor('#80ff0000')).toEqual({ r: 1, g: 0, b: 0, a: expect.closeTo(0.502, 3) });
  });

  it('parses rgb()', () => {
    expect(parseColor('rgb(0, 128, 255)')).toEqual({ r: 0, g: expect.closeTo(0.502, 3), b: 1, a: 1 });
  });

  it('parses rgba()', () => {
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('parses named colors', () => {
    expect(parseColor('white')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('returns undefined for unsupported values', () => {
    expect(parseColor('not-a-color')).toBeUndefined();
    expect(parseColor('')).toBeUndefined();
    expect(parseColor(null)).toBeUndefined();
  });
});

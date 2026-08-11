import { describe, expect, it } from 'vitest';

import { parseTransform, transform, transformsEqual, UiTransforms } from './UiTransform';

describe('UiTransform', () => {
  it('exposes an identity transform', () => {
    expect(UiTransforms.identity).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
  });

  it('creates transforms with identity defaults', () => {
    expect(transform()).toEqual(UiTransforms.identity);
    expect(transform({ x: 1 })).toEqual({ x: 1, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
    expect(transform({ rotation: 1 })).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 1 });
  });

  it('compares transforms for equality', () => {
    const a = { x: 1, y: 2, scaleX: 3, scaleY: 4, rotation: 5 };
    const b = { x: 1, y: 2, scaleX: 3, scaleY: 4, rotation: 5 };
    const c = { x: 1, y: 2, scaleX: 3, scaleY: 4, rotation: 6 };
    expect(transformsEqual(a, b)).toBe(true);
    expect(transformsEqual(a, c)).toBe(false);
  });

  it('parses complete transforms', () => {
    expect(parseTransform({ x: 1, y: 2, scaleX: 3, scaleY: 4, rotation: 5 })).toEqual({
      x: 1,
      y: 2,
      scaleX: 3,
      scaleY: 4,
      rotation: 5
    });
  });

  it('fills in missing transform fields with defaults', () => {
    expect(parseTransform({ scaleX: 2 })).toEqual({ x: 0, y: 0, scaleX: 2, scaleY: 1, rotation: 0 });
  });

  it('rejects non-object values', () => {
    expect(parseTransform(undefined)).toBeUndefined();
    expect(parseTransform('rotate(45)')).toBeUndefined();
    expect(parseTransform(42)).toBeUndefined();
  });

  it('rejects transforms with invalid numeric fields', () => {
    expect(parseTransform({ x: 'left' } as unknown as Record<string, unknown>)).toBeUndefined();
  });

  it('returns undefined for identity transforms', () => {
    expect(parseTransform({})).toBeUndefined();
    expect(parseTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })).toBeUndefined();
  });
});

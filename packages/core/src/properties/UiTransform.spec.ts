import { describe, expect, it } from 'vitest';

import { parseTransform, transform, transformsEqual, UiTransforms } from './UiTransform';

describe('UiTransform', () => {
  it('exposes an identity transform', () => {
    expect(UiTransforms.identity).toEqual({
      x: 0,
      y: 0,
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    });
  });

  it('creates transforms with identity defaults', () => {
    expect(transform()).toEqual(UiTransforms.identity);
    expect(transform({ x: 1 })).toEqual({ ...UiTransforms.identity, x: 1 });
    expect(transform({ rotation: 1 })).toEqual({ ...UiTransforms.identity, rotation: 1 });
    expect(transform({ translateX: 8, translateY: -3 })).toEqual({
      ...UiTransforms.identity,
      translateX: 8,
      translateY: -3
    });
  });

  it('compares transforms for equality', () => {
    const a = transform({ x: 1, y: 2, scaleX: 3, scaleY: 4, rotation: 5 });
    const b = transform({ x: 1, y: 2, scaleX: 3, scaleY: 4, rotation: 5 });
    const c = transform({ x: 1, y: 2, scaleX: 3, scaleY: 4, rotation: 6 });
    expect(transformsEqual(a, b)).toBe(true);
    expect(transformsEqual(a, c)).toBe(false);
  });

  it('tells a moved node from an unmoved one', () => {
    expect(transformsEqual(transform({ translateX: 4 }), transform())).toBe(false);
    expect(transformsEqual(transform({ translateY: 4 }), transform())).toBe(false);
  });

  it('parses complete transforms', () => {
    expect(parseTransform({ x: 1, y: 2, translateX: 6, translateY: 7, scaleX: 3, scaleY: 4, rotation: 5 })).toEqual({
      x: 1,
      y: 2,
      translateX: 6,
      translateY: 7,
      scaleX: 3,
      scaleY: 4,
      rotation: 5
    });
  });

  it('fills in missing transform fields with defaults', () => {
    expect(parseTransform({ scaleX: 2 })).toEqual({ ...UiTransforms.identity, scaleX: 2 });
    expect(parseTransform({ translateY: 12 })).toEqual({ ...UiTransforms.identity, translateY: 12 });
  });

  it('rejects non-object values', () => {
    expect(parseTransform(undefined)).toBeUndefined();
    expect(parseTransform('rotate(45)')).toBeUndefined();
    expect(parseTransform(42)).toBeUndefined();
  });

  it('rejects transforms with invalid numeric fields', () => {
    expect(parseTransform({ x: 'left' } as unknown as Record<string, unknown>)).toBeUndefined();
    expect(parseTransform({ translateX: 'far' } as unknown as Record<string, unknown>)).toBeUndefined();
  });

  it('returns undefined for identity transforms', () => {
    expect(parseTransform({})).toBeUndefined();
    expect(
      parseTransform({ x: 0, y: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0 })
    ).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import { auto, isAutoLength, isPercentLength, percent, resolveLength } from './UiLength';

describe('UiLength', () => {
  it('passes numbers through', () => {
    expect(resolveLength(42, undefined, 'width')).toBe(42);
    expect(resolveLength(0, 100, 'width')).toBe(0);
  });

  it('treats unset and null as no value', () => {
    expect(resolveLength(undefined, 100, 'width')).toBeUndefined();
    expect(resolveLength(null, 100, 'width')).toBeUndefined();
  });

  it('resolves percentages against a definite base only', () => {
    expect(resolveLength(percent(50), 200, 'width')).toBe(100);
    expect(resolveLength(percent(50), undefined, 'width')).toBeUndefined();
    expect(resolveLength(percent(50), Infinity, 'width')).toBeUndefined();
  });

  it('reports auto only where the caller keeps it', () => {
    expect(resolveLength(auto, 100, 'minWidth')).toBeUndefined();
    expect(resolveLength(auto, 100, 'minWidth', true)).toBe('auto');
    expect(resolveLength('auto', 100, 'marginLeft', true)).toBe('auto');
  });

  it('throws on strings and malformed objects, naming the property', () => {
    expect(() => resolveLength('100%', 200, 'width')).toThrow(/'width'.*'100%'/);
    expect(() => resolveLength({ unit: 'em', value: 2 }, 200, 'height')).toThrow(/'height'/);
    expect(() => resolveLength(Number.NaN, 200, 'top')).toThrow(/'top'/);
    expect(() => percent(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('recognises its own tagged values', () => {
    expect(isPercentLength(percent(10))).toBe(true);
    expect(isPercentLength(10)).toBe(false);
    expect(isAutoLength(auto)).toBe(true);
    expect(isAutoLength('auto')).toBe(true);
    expect(isAutoLength(0)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { findUnplainPath, requirePlainData } from './plainData';

class Product {
  constructor(readonly id: string) {}
}

describe('findUnplainPath', () => {
  it('accepts primitives, arrays and plain objects', () => {
    expect(findUnplainPath({ a: 1, b: 'two', c: [true, null, { d: undefined }] })).toBeNull();
    expect(findUnplainPath([])).toBeNull();
    expect(findUnplainPath(null)).toBeNull();
  });

  it('names the path to a class instance', () => {
    expect(findUnplainPath({ rows: [{ product: new Product('a') }] })).toBe('.rows[0].product');
  });

  it('rejects the values structurallyEqual compares by reference', () => {
    expect(findUnplainPath(new Date())).toBe('');
    expect(findUnplainPath({ at: new Date() })).toBe('.at');
    expect(findUnplainPath({ byId: new Map() })).toBe('.byId');
    expect(findUnplainPath({ tags: new Set() })).toBe('.tags');
    expect(findUnplainPath({ onPick: () => {} })).toBe('.onPick');
  });

  it('accepts a null-prototype object, which compares structurally', () => {
    expect(findUnplainPath(Object.create(null) as object)).toBeNull();
  });
});

describe('requirePlainData', () => {
  it('says what is wrong, where, and what to do about it', () => {
    expect(() => requirePlainData('catalog', 'products', [{ added: new Date() }])).toThrow(
      /Channel 'catalog' published 'products'\[0\]\.added, which is not plain data/
    );
    expect(() => requirePlainData('catalog', 'products', [{ added: new Date() }])).toThrow(
      /Flatten it in the view model/
    );
  });

  it('passes plain data through', () => {
    expect(() => requirePlainData('catalog', 'products', [{ id: 'a', price: 1 }])).not.toThrow();
  });
});

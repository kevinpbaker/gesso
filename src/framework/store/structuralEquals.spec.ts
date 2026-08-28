import { describe, expect, it } from 'vitest';

import { structurallyEqual } from './structuralEquals';

describe('structurallyEqual', () => {
  it('compares primitives by value', () => {
    expect(structurallyEqual(1, 1)).toBe(true);
    expect(structurallyEqual('a', 'a')).toBe(true);
    expect(structurallyEqual(1, 2)).toBe(false);
    expect(structurallyEqual(null, null)).toBe(true);
    expect(structurallyEqual(undefined, undefined)).toBe(true);
    expect(structurallyEqual(null, undefined)).toBe(false);
  });

  it('treats NaN as equal to itself', () => {
    expect(structurallyEqual(NaN, NaN)).toBe(true);
  });

  it('compares distinct objects with the same shape as equal', () => {
    expect(structurallyEqual({ itemCount: 2, total: 40 }, { itemCount: 2, total: 40 })).toBe(true);
    expect(structurallyEqual({ itemCount: 2 }, { itemCount: 3 })).toBe(false);
  });

  it('distinguishes objects with different key sets', () => {
    expect(structurallyEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(structurallyEqual({ a: 1, b: undefined }, { a: 1, c: undefined })).toBe(false);
  });

  it('compares arrays element-wise', () => {
    expect(structurallyEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(structurallyEqual([1, 2], [2, 1])).toBe(false);
    expect(structurallyEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('does not treat an array as equal to an object', () => {
    expect(structurallyEqual([] as unknown, {} as unknown)).toBe(false);
  });

  it('recurses through nested view models', () => {
    const left = { visible: [{ id: 'a', done: false }], counts: { total: 1, completed: 0 } };
    const right = { visible: [{ id: 'a', done: false }], counts: { total: 1, completed: 0 } };
    expect(structurallyEqual(left, right)).toBe(true);

    const changed = { visible: [{ id: 'a', done: true }], counts: { total: 1, completed: 0 } };
    expect(structurallyEqual(left, changed)).toBe(false);
  });

  it('falls back to reference equality for class instances', () => {
    class Point {
      constructor(readonly x: number) {}
    }
    const point = new Point(1);

    expect(structurallyEqual(point, point)).toBe(true);
    // Conservative: reports a change rather than deep-comparing a type
    // whose identity may be meaningful.
    expect(structurallyEqual(new Point(1), new Point(1))).toBe(false);
    expect(structurallyEqual(new Date(0), new Date(0))).toBe(false);
  });

  it('terminates on cyclic structures', () => {
    const left: Record<string, unknown> = { name: 'a' };
    left.self = left;
    const right: Record<string, unknown> = { name: 'a' };
    right.self = right;

    // Reports "changed" rather than looping forever.
    expect(structurallyEqual(left, right)).toBe(false);
  });
});

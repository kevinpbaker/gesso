import { describe, expect, it } from 'vitest';

import { clampSize, Constraints, constraintsEqual, tightenConstraints } from './LayoutTypes';

describe('Constraints', () => {
  it('defaults to unbounded', () => {
    const constraints = Constraints.unbounded();
    expect(constraints.minWidth).toBe(0);
    expect(constraints.maxWidth).toBe(Infinity);
    expect(constraints.minHeight).toBe(0);
    expect(constraints.maxHeight).toBe(Infinity);
    expect(constraints.hasBoundedWidth()).toBe(false);
    expect(constraints.hasBoundedHeight()).toBe(false);
  });

  it('creates tight constraints', () => {
    const constraints = Constraints.tight(100, 50);
    expect(constraints.minWidth).toBe(100);
    expect(constraints.maxWidth).toBe(100);
    expect(constraints.minHeight).toBe(50);
    expect(constraints.maxHeight).toBe(50);
  });

  it('creates loose constraints', () => {
    const constraints = Constraints.loose(100, 50);
    expect(constraints.minWidth).toBe(0);
    expect(constraints.maxWidth).toBe(100);
    expect(constraints.hasBoundedWidth()).toBe(true);
  });
});

describe('tightenConstraints', () => {
  it('tightens a bounded axis with an explicit size', () => {
    const result = tightenConstraints(Constraints.unbounded(), { width: 200 });
    expect(result.minWidth).toBe(200);
    expect(result.maxWidth).toBe(200);
    expect(result.hasBoundedHeight()).toBe(false);
  });

  it('applies min bounds', () => {
    const result = tightenConstraints(Constraints.unbounded(), { minWidth: 50 });
    expect(result.minWidth).toBe(50);
    expect(result.maxWidth).toBe(Infinity);
  });

  it('applies max bounds', () => {
    const result = tightenConstraints(Constraints.unbounded(), { maxWidth: 300 });
    expect(result.maxWidth).toBe(300);
  });

  it('respects an existing max bound', () => {
    const result = tightenConstraints(Constraints.loose(100, 100), { maxWidth: 200 });
    expect(result.maxWidth).toBe(100);
  });

  it('lets a min bound win over a conflicting max', () => {
    const result = tightenConstraints(Constraints.unbounded(), { minWidth: 100, maxWidth: 50 });
    expect(result.maxWidth).toBe(100);
  });

  it('clamps min bounds to zero', () => {
    const result = tightenConstraints(Constraints.unbounded(), { minWidth: -10 });
    expect(result.minWidth).toBe(0);
  });
});

describe('clampSize', () => {
  it('clamps to bounds', () => {
    const size = clampSize(Constraints.loose(100, 50), 120, 40);
    expect(size).toEqual({ width: 100, height: 40 });
  });

  it('grows to min bounds', () => {
    const size = clampSize(new Constraints(50, 100, 50, 100), 10, 10);
    expect(size).toEqual({ width: 50, height: 50 });
  });

  it('passes through values inside bounds', () => {
    const size = clampSize(Constraints.loose(100, 100), 40, 20);
    expect(size).toEqual({ width: 40, height: 20 });
  });
});

describe('constraintsEqual', () => {
  it('compares all four bounds', () => {
    const a = Constraints.loose(100, 50);
    expect(constraintsEqual(a, Constraints.loose(100, 50))).toBe(true);
    expect(constraintsEqual(a, Constraints.loose(100, 60))).toBe(false);
    expect(constraintsEqual(a, Constraints.unbounded())).toBe(false);
  });

  it('treats Infinity consistently', () => {
    expect(constraintsEqual(Constraints.unbounded(), Constraints.unbounded())).toBe(true);
  });
});

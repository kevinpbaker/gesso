import { describe, expect, it } from 'vitest';

import { decorationRect, type DecorationShape } from './Decorations';
import type { LayoutRecord } from '../layout/LayoutRecord';

/**
 * Placing a decoration, from any two of near edge, size and far edge.
 *
 * The rule is CSS's for an absolutely positioned box, and it is here
 * for the same reason CSS has it: a shape that can only be placed from
 * the top left cannot say "the bottom edge" or "between the two
 * horizontal borders" without already knowing how tall the node is.
 * An application that declares its own geometry can do the arithmetic;
 * a general modifier cannot, which is what kept `borders()` from
 * existing.
 */
const RECORD = { x: 100, y: 200, width: 40, height: 20 } as unknown as LayoutRecord;

function rect(shape: Partial<DecorationShape>) {
  return decorationRect({ kind: 'fill', color: 'border', ...shape } as DecorationShape, RECORD, 0);
}

describe('decorationRect', () => {
  it('fills the node when nothing is said', () => {
    expect(rect({})).toEqual({ x: 100, y: 200, width: 40, height: 20, radius: 0 });
  });

  it('places from the near edge with a size', () => {
    expect(rect({ x: 4, width: 6, y: 2, height: 3 })).toMatchObject({ x: 104, y: 202, width: 6, height: 3 });
  });

  it('places from the far edge with a size', () => {
    // The bottom edge, two pixels: the case that could not be written.
    expect(rect({ bottom: 0, height: 2 })).toMatchObject({ x: 100, y: 218, width: 40, height: 2 });
    expect(rect({ right: 0, width: 2 })).toMatchObject({ x: 138, y: 200, width: 2, height: 20 });
  });

  it('spans between the two edges when both insets are given', () => {
    expect(rect({ y: 3, bottom: 5 })).toMatchObject({ y: 203, height: 12 });
    expect(rect({ x: 3, right: 5 })).toMatchObject({ x: 103, width: 32 });
  });

  it('lets the size win when all three are given, as CSS does', () => {
    expect(rect({ x: 4, width: 6, right: 30 })).toMatchObject({ x: 104, width: 6 });
  });

  it('measures a far inset from the far edge even with no size', () => {
    expect(rect({ right: 10 })).toMatchObject({ x: 100, width: 30 });
    expect(rect({ bottom: 4 })).toMatchObject({ y: 200, height: 16 });
  });

  it('never resolves to a negative size', () => {
    expect(rect({ x: 30, right: 30 })).toMatchObject({ width: 0 });
  });

  it('grows by the outset on both sides, however the rectangle was described', () => {
    // The outset means the same thing whichever two of the three fixed
    // the rectangle, which is the property that makes it composable
    // with the rest.
    expect(rect({ outset: 2 })).toMatchObject({ x: 98, y: 198, width: 44, height: 24 });
    expect(rect({ bottom: 0, height: 2, outset: 2 })).toMatchObject({ y: 216, height: 6 });
    expect(rect({ right: 0, width: 2, outset: 2 })).toMatchObject({ x: 136, width: 6 });
    expect(rect({ y: 4, bottom: 4, outset: 1 })).toMatchObject({ y: 203, height: 14 });
  });

  it('inherits the node radius, grown by the outset', () => {
    const shape = { kind: 'fill', color: 'border', outset: 3 } as DecorationShape;
    expect(decorationRect(shape, RECORD, 6).radius).toBe(9);
  });

  it('takes an explicit radius over the inherited one', () => {
    const shape = { kind: 'fill', color: 'border', outset: 3, radius: 1 } as DecorationShape;
    expect(decorationRect(shape, RECORD, 6).radius).toBe(1);
  });
});

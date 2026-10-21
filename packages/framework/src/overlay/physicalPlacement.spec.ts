import { describe, expect, it } from 'vitest';

import { physicalPlacement } from './OverlayService';

/**
 * The layout engine places by screen edges; the overlay layer's
 * placements name the reading edges as well, and this turns one into
 * the other.
 */
describe('physicalPlacement', () => {
  it('leaves every placement as it is in left-to-right text, but for the logical sides', () => {
    expect(physicalPlacement('bottom-start', false)).toBe('bottom-start');
    expect(physicalPlacement('top-end', false)).toBe('top-end');
    expect(physicalPlacement('right-start', false)).toBe('right-start');
    expect(physicalPlacement('start', false)).toBe('left');
    expect(physicalPlacement('end-start', false)).toBe('right-start');
  });

  it('turns an alignment along the top or the bottom in right-to-left text', () => {
    expect(physicalPlacement('bottom-start', true)).toBe('bottom-end');
    expect(physicalPlacement('bottom-end', true)).toBe('bottom-start');
    expect(physicalPlacement('top-start', true)).toBe('top-end');
    expect(physicalPlacement('top', true)).toBe('top');
  });

  it('puts the start side on the right and the end side on the left, keeping the alignment up and down', () => {
    expect(physicalPlacement('start', true)).toBe('right');
    expect(physicalPlacement('start-end', true)).toBe('right-end');
    expect(physicalPlacement('end', true)).toBe('left');
    expect(physicalPlacement('end-start', true)).toBe('left-start');
  });

  it('keeps a physical side physical, alignment and all', () => {
    expect(physicalPlacement('left', true)).toBe('left');
    expect(physicalPlacement('right-start', true)).toBe('right-start');
    expect(physicalPlacement('left-end', true)).toBe('left-end');
  });
});

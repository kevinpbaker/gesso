import { describe, expect, it } from 'vitest';

import { measure } from './WorkerApp';

/**
 * The size a runtime starts at.
 *
 * A host with padding is the case that mattered: the playground's
 * preview pane has 16px on every side, so `host.clientWidth` — which
 * includes padding — reported a viewport 32px wider than the canvas
 * inside it. The runtime laid the app out for that larger viewport and
 * sized the backing store to match, so the first frame came out scaled
 * and pointer coordinates, taken from the canvas's real rect, were off
 * by the same ratio. Everything else in the pipeline already measured
 * the content box: the ResizeObserver reports `contentRect`, and the
 * playground's own `observeSize` subtracts the padding by hand.
 */

interface Rect {
  width: number;
  height: number;
}

function fakeCanvas(rect: Rect): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => ({ width: rect.width, height: rect.height }) as DOMRect
  } as unknown as HTMLCanvasElement;
}

function fakeHost(clientWidth: number, clientHeight: number): HTMLElement {
  return { clientWidth, clientHeight } as unknown as HTMLElement;
}

describe('measure', () => {
  it('takes the canvas box, not the padded host box', () => {
    // A 1241x786 host with 16px padding holds a 1209x754 canvas.
    const size = measure(fakeCanvas({ width: 1209, height: 754 }), fakeHost(1241, 786));
    expect(size).toEqual({ width: 1209, height: 754 });
  });

  it('falls back to the host content box before the canvas is laid out', () => {
    // A canvas mounted while detached has no box yet. Without a
    // getComputedStyle to consult, the padding cannot be subtracted,
    // which is why the canvas rect is preferred whenever it exists.
    const size = measure(fakeCanvas({ width: 0, height: 0 }), fakeHost(800, 600));
    expect(size).toEqual({ width: 800, height: 600 });
  });

  it('falls back to a fixed default when neither has been laid out', () => {
    const size = measure(fakeCanvas({ width: 0, height: 0 }), fakeHost(0, 0));
    expect(size).toEqual({ width: 600, height: 600 });
  });
});

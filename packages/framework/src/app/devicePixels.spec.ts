import { afterEach, describe, expect, it } from 'vitest';

import { fitToDevicePixels, observeDevicePixels } from './devicePixels';

describe('fitToDevicePixels', () => {
  it('lays out at the size whose rounding is the canvas’s device pixels', () => {
    // 800.4 CSS pixels at 1.25 is 1000.5, which rounds to 1001; the
    // browser put the canvas on 1000.
    const fitted = fitToDevicePixels({ width: 800.4, height: 600 }, 1.25, { width: 1000, height: 750 });
    expect(Math.round(fitted.width * 1.25)).toBe(1000);
    expect(Math.round(fitted.height * 1.25)).toBe(750);
    expect(Math.abs(fitted.width - 800.4)).toBeLessThan(1 / 1.25);
  });

  it('keeps the size when the device pixels are from another moment', () => {
    // The host grew and the canvas has not been measured since.
    expect(fitToDevicePixels({ width: 900, height: 600 }, 2, { width: 1600, height: 1200 })).toEqual({
      width: 900,
      height: 600
    });
  });

  it('keeps the size where the browser reports no device pixels', () => {
    expect(fitToDevicePixels({ width: 800.4, height: 600 }, 1.25, null)).toEqual({ width: 800.4, height: 600 });
  });
});

describe('observeDevicePixels', () => {
  const scope = globalThis as Record<string, unknown>;
  const before = scope.ResizeObserver;
  afterEach(() => {
    scope.ResizeObserver = before;
  });

  it('asks for the device-pixel content box and reports it', () => {
    let options: unknown;
    let notify: ((entries: unknown[]) => void) | undefined;
    scope.ResizeObserver = class {
      constructor(callback: (entries: unknown[]) => void) {
        notify = callback;
      }
      observe(_element: unknown, given: unknown): void {
        options = given;
      }
      disconnect(): void {}
    };
    const seen: unknown[] = [];
    observeDevicePixels({} as Element, size => seen.push(size));

    notify!([{ devicePixelContentBoxSize: [{ inlineSize: 1000, blockSize: 750 }] }]);

    expect(options).toEqual({ box: 'device-pixel-content-box' });
    expect(seen).toEqual([{ width: 1000, height: 750 }]);
  });

  it('reports nothing, and throws nothing, where the box is not supported', () => {
    scope.ResizeObserver = class {
      observe(): void {
        throw new TypeError("The provided value 'device-pixel-content-box' is not a valid enum value");
      }
      disconnect(): void {}
    };
    const seen: unknown[] = [];
    expect(() => observeDevicePixels({} as Element, size => seen.push(size))()).not.toThrow();
    expect(seen).toEqual([]);
  });
});

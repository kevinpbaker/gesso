import { describe, expect, it } from 'vitest';
import {
  CharacterCountTextMeasurer,
  Column,
  Text,
  UiManualFrameClock,
  clearFontStacks,
  fontStackFor
} from '@gesso/core';
import type { TextMeasureRequest } from '@gesso/core';

import { ServiceRegistry } from '../service/ServiceRegistry';
import { FontService, type FontFaceLike, type FontHost } from './FontService';
import { GessoRuntime } from './GessoRuntime';
import { mockCanvas } from './RuntimeTestUtils';

/** Counts what layout asks of it, and remembers being told to forget. */
class CountingMeasurer extends CharacterCountTextMeasurer {
  runs = 0;
  invalidations = 0;

  override measureRunWidth(text: string, request: TextMeasureRequest): number {
    this.runs++;
    return super.measureRunWidth(text, request);
  }

  override invalidate(): void {
    // The base class forgets its laid-out paragraphs; a measurer that
    // did not would answer the re-measure below from memory.
    super.invalidate();
    this.invalidations++;
  }
}

function fakeHost(): FontHost & { settle: () => void } {
  const settlers: Array<() => void> = [];
  return {
    fonts: { add: () => undefined },
    createFace: (family): FontFaceLike => ({
      family,
      load: () => new Promise(resolve => settlers.push(() => resolve(undefined)))
    }),
    settle: () => settlers.splice(0).forEach(settle => settle())
  };
}

describe('GessoRuntime and fonts', () => {
  it('measures the whole tree again, from a cleared cache, when a declared face arrives', async () => {
    clearFontStacks();
    let clock!: UiManualFrameClock;
    const measurer = new CountingMeasurer();
    const services = new ServiceRegistry();
    services.register(FontService);
    const runtime = new GessoRuntime({
      root: Column({}, Text({ text: 'hello', fontFamily: 'Inter' }), Text({ text: 'world' })),
      canvas: mockCanvas(800, 600),
      width: 800,
      height: 600,
      textMeasurer: measurer,
      services,
      clock: cb => (clock = new UiManualFrameClock(cb))
    });
    runtime.start();
    if (clock.isPending) clock.tick(0);
    const measuredAtFirst = measurer.runs;
    expect(measuredAtFirst).toBeGreaterThan(0);

    // Nothing is dirty, so no frame is even asked for.
    expect(clock.isPending).toBe(false);

    const host = fakeHost();
    services.get(FontService).declare(
      [
        {
          family: 'Inter',
          faces: [{ source: `https://fonts.test/inter-${Math.random()}.woff2` }],
          fallback: ['sans-serif']
        }
      ],
      host
    );
    expect(fontStackFor('Inter')).toBe('Inter, sans-serif');
    expect(measurer.invalidations).toBe(0);

    host.settle();
    await services.get(FontService).ready;
    expect(measurer.invalidations).toBe(1);
    expect(services.get(FontService).statusOf('Inter')).toBe('loaded');

    // The arrival asked for a frame, and that frame measured the text again.
    expect(clock.isPending).toBe(true);
    clock.tick(32);
    expect(measurer.runs).toBeGreaterThan(measuredAtFirst);
    expect(clock.isPending).toBe(false);

    runtime.dispose();
    clearFontStacks();
  });
});

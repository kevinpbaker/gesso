import { describe, expect, it } from 'vitest';

import { ScaledImageCache, type ScaledImageSurface } from './ScaledImageCache';

/** A stand-in for an `ImageBitmap`, which Node does not have. */
function bitmap(width: number, height: number): ImageBitmap {
  return {
    width,
    height,
    closed: false,
    close(): void {
      (this as { closed: boolean }).closed = true;
    }
  } as unknown as ImageBitmap;
}

function isClosed(image: ImageBitmap): boolean {
  return (image as unknown as { closed: boolean }).closed;
}

/**
 * Counts the copies made, because the whole point of the cache is how
 * few of them there are.
 */
function factory(): { create: (width: number, height: number) => ScaledImageSurface; copies: ImageBitmap[] } {
  const copies: ImageBitmap[] = [];
  return {
    copies,
    create(width: number, height: number): ScaledImageSurface {
      const made = bitmap(width, height);
      return {
        width,
        height,
        getContext: () => ({ drawImage: () => {} }),
        transferToImageBitmap: () => {
          copies.push(made);
          return made;
        }
      };
    }
  };
}

describe('ScaledImageCache', () => {
  it('hands back the source until a size has held for two frames', () => {
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(1280, 992);

    expect(cache.resolve(source, 400, 310)).toBe(source);
    expect(copies).toHaveLength(0);

    const copy = cache.resolve(source, 400, 310);
    expect(copy).not.toBe(source);
    expect(copy.width).toBe(400);
    expect(copy.height).toBe(310);
    expect(copies).toHaveLength(1);
  });

  it('reuses the copy for as long as the size holds', () => {
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(1280, 992);

    cache.resolve(source, 400, 310);
    const copy = cache.resolve(source, 400, 310);
    for (let i = 0; i < 10; i++) {
      expect(cache.resolve(source, 400, 310)).toBe(copy);
    }
    expect(copies).toHaveLength(1);
  });

  it('makes no copy while the size changes every frame, as a morph makes it', () => {
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(1280, 992);

    for (let i = 0; i < 20; i++) {
      expect(cache.resolve(source, 400 + i, 310 + i)).toBe(source);
    }
    expect(copies).toHaveLength(0);
  });

  it('keeps a copy per settled size rather than replacing the last one', () => {
    // A second settled size does not evict the first. It used to, and
    // that is what made a picture drawn at two sizes at once shimmer:
    // see "one picture at two sizes at once" below. Memory is bounded
    // by the entry count instead, which is what `MAX_ENTRIES` is for.
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(1280, 992);

    cache.resolve(source, 400, 310);
    const first = cache.resolve(source, 400, 310);

    expect(cache.resolve(source, 800, 620)).toBe(source);
    const second = cache.resolve(source, 800, 620);

    expect(second).not.toBe(first);
    expect(second.width).toBe(800);
    expect(isClosed(first)).toBe(false);
    expect(copies).toHaveLength(2);
    // And the first size is still answered from its own copy.
    expect(cache.resolve(source, 400, 310)).toBe(first);
  });

  it('copies nothing for an image already drawn at its own size', () => {
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(64, 64);

    for (let i = 0; i < 5; i++) {
      expect(cache.resolve(source, 64, 64)).toBe(source);
    }
    expect(copies).toHaveLength(0);
    expect(cache.size).toBe(0);
  });

  it('copies nothing for a destination too large to be worth keeping', () => {
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(1280, 992);

    for (let i = 0; i < 5; i++) {
      expect(cache.resolve(source, 6000, 6000)).toBe(source);
    }
    expect(copies).toHaveLength(0);
  });

  it('rounds a fractional device size, so a subpixel wobble is still one size', () => {
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(1280, 992);

    cache.resolve(source, 400.2, 310.4);
    const copy = cache.resolve(source, 399.8, 309.6);
    expect(copy.width).toBe(400);
    expect(copies).toHaveLength(1);
  });

  it('draws the source rather than dying when a copy cannot be made', () => {
    const cache = new ScaledImageCache(() => {
      throw new Error('no surface');
    });
    const source = bitmap(1280, 992);

    cache.resolve(source, 400, 310);
    expect(cache.resolve(source, 400, 310)).toBe(source);
  });

  it('evicts the least recently used source, closing what it held', () => {
    const { create } = factory();
    const cache = new ScaledImageCache(create);
    const sources = Array.from({ length: 60 }, () => bitmap(1280, 992));

    for (const source of sources) {
      cache.resolve(source, 400, 310);
      cache.resolve(source, 400, 310);
    }

    expect(cache.size).toBeLessThanOrEqual(48);
    // The first source in is the first out, and its copy went with it.
    expect(cache.resolve(sources[0]!, 400, 310)).toBe(sources[0]);
  });

  it('closes every copy when disposed', () => {
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(1280, 992);

    cache.resolve(source, 400, 310);
    cache.resolve(source, 400, 310);
    cache.dispose();

    expect(copies.every(isClosed)).toBe(true);
    expect(cache.size).toBe(0);
  });
});

describe('one picture at two sizes at once', () => {
  /**
   * Segue's now-playing bar shows the same cover at 52px that its page
   * shows at 340, and both are drawn every frame. With one slot per
   * source the two sizes cancelled each other out: neither ever held
   * the slot for two consecutive resolves, so `stable` never reached
   * the threshold, no copy was ever made, and the 480px source was
   * resampled down to 52 on every frame. That resample is a linear
   * sample with no mip chain under it, which aliases, and on screen it
   * reads as the small picture shimmering.
   */
  it('gives each size its own copy instead of starving both', () => {
    const made = factory();
    const cache = new ScaledImageCache(made.create);
    const source = bitmap(480, 480);

    const barDrew: number[] = [];
    for (let frame = 0; frame < 20; frame += 1) {
      barDrew.push(cache.resolve(source, 52, 52).width);
      cache.resolve(source, 340, 340);
    }

    // One warm-up frame apiece while the size proves itself, and a copy
    // from then on rather than the source resampled every frame.
    expect(barDrew[0]).toBe(480);
    expect([...new Set(barDrew.slice(2))]).toEqual([52]);
    expect(made.copies.map(copy => copy.width).sort((a, b) => a - b)).toEqual([52, 340]);
  });

  it('keeps both copies alive, so neither closes the other', () => {
    const made = factory();
    const cache = new ScaledImageCache(made.create);
    const source = bitmap(480, 480);
    for (let frame = 0; frame < 6; frame += 1) {
      cache.resolve(source, 52, 52);
      cache.resolve(source, 340, 340);
    }
    expect(made.copies).toHaveLength(2);
    expect(made.copies.every(copy => !isClosed(copy))).toBe(true);
  });

  it('still makes no copy for a size that is never asked for twice', () => {
    // A morph scales its picture every frame, and a copy per frame
    // would make the most frame-sensitive case the most expensive.
    const made = factory();
    const cache = new ScaledImageCache(made.create);
    const source = bitmap(480, 480);
    for (let step = 0; step < 20; step += 1) {
      cache.resolve(source, 52 + step, 52 + step);
    }
    expect(made.copies).toHaveLength(0);
  });
});

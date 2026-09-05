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

  it('replaces the copy, and closes the old one, when a new size settles', () => {
    const { create, copies } = factory();
    const cache = new ScaledImageCache(create);
    const source = bitmap(1280, 992);

    cache.resolve(source, 400, 310);
    const first = cache.resolve(source, 400, 310);

    expect(cache.resolve(source, 800, 620)).toBe(source);
    const second = cache.resolve(source, 800, 620);

    expect(second).not.toBe(first);
    expect(second.width).toBe(800);
    expect(isClosed(first)).toBe(true);
    expect(copies).toHaveLength(2);
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

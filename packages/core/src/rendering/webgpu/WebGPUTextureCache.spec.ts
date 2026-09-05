import { describe, expect, it, vi } from 'vitest';

import type { ScaledImageSurface } from '../ScaledImageCache';
import { WebGPUTextureCache } from './WebGPUTextureCache';
import type { TexturedPipeline } from './WebGPUPipeline';

/** A stand-in for an `ImageBitmap`, which Node does not have. */
function bitmap(width: number, height: number): ImageBitmap {
  return { width, height, close: () => {} } as unknown as ImageBitmap;
}

/** Somewhere to draw a copy, and a record of the sizes asked for. */
function surfaces() {
  return (width: number, height: number): ScaledImageSurface => ({
    width,
    height,
    getContext: () => ({ drawImage: () => {} }),
    transferToImageBitmap: () => bitmap(width, height)
  });
}

function deviceDouble() {
  const created: { width: number; height: number }[] = [];
  const device = {
    createTexture: vi.fn((descriptor: { size: [number, number] }) => {
      created.push({ width: descriptor.size[0], height: descriptor.size[1] });
      return { destroy: vi.fn(), createView: vi.fn(() => ({})) };
    }),
    createBindGroup: vi.fn(() => ({})),
    queue: { copyExternalImageToTexture: vi.fn() }
  } as unknown as GPUDevice;
  const pipeline = {
    bindGroupLayout: {},
    uniformBuffer: {},
    imageSampler: {}
  } as unknown as TexturedPipeline;
  return { device, pipeline, created };
}

/**
 * A still is uploaded at the size it is drawn.
 *
 * A texture is uploaded once and sampled every frame, so what a
 * too-large source costs is not bandwidth but minification: the sampler
 * is `linear` with no mip chain under it, so a 480px cover drawn into 56
 * logical pixels reads texels far apart on every frame, which both
 * aliases and misses the texture cache. Canvas2D solved the same problem
 * with `ScaledImageCache`; this is that cache on the other backend.
 */
describe('WebGPUTextureCache and the size a still is drawn at', () => {
  it('uploads the source until a copy at the drawn size is worth making', () => {
    const { device, pipeline, created } = deviceDouble();
    const cache = new WebGPUTextureCache(device, pipeline, surfaces());
    const image = bitmap(480, 480);

    // The first frames draw exactly as they did before: the copy is not
    // made until the size has held, so an animating size never builds
    // one it will not be asked for again.
    cache.imageBindGroup(image, 112, 112);
    expect(created).toEqual([{ width: 480, height: 480 }]);
  });

  it('uploads a copy at the drawn size once that size has settled', () => {
    const { device, pipeline, created } = deviceDouble();
    const cache = new WebGPUTextureCache(device, pipeline, surfaces());
    const image = bitmap(480, 480);

    for (let frame = 0; frame < 4; frame++) {
      cache.imageBindGroup(image, 112, 112);
    }
    // The full-size upload from the first frames, and then one at the
    // size it is actually drawn.
    expect(created).toContainEqual({ width: 112, height: 112 });
    // And it is uploaded once, not once per frame.
    expect(created.filter(size => size.width === 112)).toHaveLength(1);
  });

  it('uploads the source when the caller does not know the drawn size', () => {
    const { device, pipeline, created } = deviceDouble();
    const cache = new WebGPUTextureCache(device, pipeline, surfaces());
    const image = bitmap(480, 480);

    for (let frame = 0; frame < 4; frame++) {
      cache.imageBindGroup(image);
    }
    expect(created).toEqual([{ width: 480, height: 480 }]);
  });

  it('draws the same still at two sizes without re-uploading either', () => {
    // A cover on a shelf and the same cover on the page it opens.
    const { device, pipeline, created } = deviceDouble();
    const cache = new WebGPUTextureCache(device, pipeline, surfaces());
    const image = bitmap(480, 480);

    for (let frame = 0; frame < 4; frame++) {
      cache.imageBindGroup(image, 112, 112);
      cache.imageBindGroup(image, 328, 328);
    }
    const before = created.length;
    cache.imageBindGroup(image, 112, 112);
    cache.imageBindGroup(image, 328, 328);
    expect(created.length).toBe(before);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { DefaultImageResolver, IconRasterizer, type ImageResolver, type VideoResolver } from 'gesso-core';

import { LazyVideoResolver, MediaService } from './MediaService';

/**
 * Who disposes what.
 *
 * The three seams are one rule: the service disposes what it built and
 * leaves alone what it was handed. An application that supplies a
 * resolver, a rasteriser or a decoder usually keeps a reference to it,
 * often shares it between runtimes, and a service that closed it on
 * the way out would take the other runtime's bitmaps with it.
 */

/** A resolver that records nothing but whether it was disposed. */
function fakeImageResolver(): ImageResolver & { disposed: boolean } {
  return {
    disposed: false,
    resolve: () => Promise.reject(new Error('not used')),
    release: () => {},
    dispose(): void {
      this.disposed = true;
    }
  };
}

function fakeVideoResolver(): VideoResolver & { disposed: boolean } {
  return {
    disposed: false,
    resolve: () => Promise.reject(new Error('not used')),
    release: () => {},
    dispose(): void {
      this.disposed = true;
    }
  };
}

describe('MediaService pixel ratio', () => {
  it('sets the ratio on the icon rasteriser it built', () => {
    const service = new MediaService();
    service.setPixelRatio(1.25);
    expect(service.icons.pixelScale).toBe(1.25);
  });

  it('leaves the scale of a rasteriser it was given alone', () => {
    const service = new MediaService();
    const supplied = new IconRasterizer({ scale: 2 });
    service.setRasterizer(supplied);
    service.setPixelRatio(3);
    expect(supplied.pixelScale).toBe(2);
  });
});

describe('MediaService ownership', () => {
  it('disposes the image resolver it built, and not one it was given', () => {
    const service = new MediaService();
    const built = service.images;
    const builtDispose = vi.spyOn(built, 'dispose');
    const supplied = fakeImageResolver();

    service.setResolver(supplied);
    expect(builtDispose).toHaveBeenCalledTimes(1);

    service.dispose();
    expect(supplied.disposed).toBe(false);
  });

  it('disposes the icon rasteriser it built, and not one it was given', () => {
    const service = new MediaService();
    const built = service.icons;
    const builtDispose = vi.spyOn(built, 'dispose');
    const supplied = new IconRasterizer();
    const suppliedDispose = vi.spyOn(supplied, 'dispose');

    service.setRasterizer(supplied);
    expect(builtDispose).toHaveBeenCalledTimes(1);

    service.dispose();
    expect(suppliedDispose).not.toHaveBeenCalled();
  });

  it('leaves a replaced rasteriser to the application that supplied it', () => {
    const service = new MediaService();
    const first = new IconRasterizer();
    const firstDispose = vi.spyOn(first, 'dispose');
    service.setRasterizer(first);

    // Two rasterisers from the same application, the second replacing
    // the first: neither is the service's to close.
    service.setRasterizer(new IconRasterizer());

    expect(firstDispose).not.toHaveBeenCalled();
  });

  it('disposes the video resolver it built lazily, and not one it was given', () => {
    const service = new MediaService();
    const supplied = fakeVideoResolver();

    service.setVideoResolver(supplied);
    service.dispose();

    expect(supplied.disposed).toBe(false);
  });

  it('replaces the default image resolver with the one it is given', () => {
    const service = new MediaService();
    const supplied = new DefaultImageResolver({
      fetch: () => Promise.resolve(new Blob()),
      decode: () => Promise.reject(new Error('not used'))
    });

    service.setResolver(supplied);

    expect(service.images).toBe(supplied);
  });
});

describe('LazyVideoResolver', () => {
  it('loads nothing until a video is asked for, and loads once', async () => {
    const real = { ...fakeVideoResolver(), resolve: vi.fn(() => Promise.resolve({} as never)) };
    const load = vi.fn(() => Promise.resolve(real));
    const lazy = new LazyVideoResolver(load);
    expect(load).not.toHaveBeenCalled();

    await Promise.all([lazy.resolve('a.mp4'), lazy.resolve('b.mp4')]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(real.resolve.mock.calls).toEqual([['a.mp4'], ['b.mp4']]);
  });

  it('keeps a release that arrives during the load after the resolve it follows', async () => {
    const calls: string[] = [];
    const real: VideoResolver = {
      resolve: source => (calls.push(`resolve ${source}`), Promise.resolve({} as never)),
      release: source => calls.push(`release ${source}`),
      dispose: () => calls.push('dispose')
    };
    const lazy = new LazyVideoResolver(() => Promise.resolve(real));

    const resolved = lazy.resolve('a.mp4');
    lazy.release('a.mp4');
    lazy.dispose();
    await resolved;
    await Promise.resolve();

    expect(calls).toEqual(['resolve a.mp4', 'release a.mp4', 'dispose']);
  });

  it('never loads the decoder for a service that is disposed without playing a video', () => {
    const load = vi.fn(() => Promise.resolve(fakeVideoResolver()));
    const lazy = new LazyVideoResolver(load);
    lazy.release('a.mp4');
    lazy.dispose();
    expect(load).not.toHaveBeenCalled();
  });
});

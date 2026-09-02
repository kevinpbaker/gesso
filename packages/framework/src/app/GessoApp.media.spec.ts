import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DefaultImageResolver,
  IconRasterizer,
  Text,
  UiManualFrameClock,
  type CanvasHost,
  type ImageResolver,
  type UiChild,
  type VideoResolver
} from '@gesso/core';

import { Component } from '../Component';
import { Define, Inject } from '../decorators';
import { createComponent } from '../createComponent';
import { createApp } from './createApp';
import { GessoApp } from './GessoApp';
import { MediaService } from './MediaService';

/**
 * The `media` option, on the single-thread configuration.
 *
 * The point of it being an option rather than a call on the store is
 * timing: the tree is built inside the runtime's constructor and an
 * `Image` in it asks for its bitmap the moment it is built, so a
 * resolver installed afterwards has already missed the first screen.
 * The probe below records what the store held while its own body ran,
 * which is the earliest moment any component could ask.
 */

function createMockCanvas(width = 600, height = 600): CanvasHost {
  const ctx: Record<string, unknown> = {};
  for (const method of ['save', 'restore', 'setTransform', 'clearRect', 'fillRect', 'beginPath', 'fill', 'fillText']) {
    ctx[method] = vi.fn();
  }
  ctx.measureText = vi.fn((text: string) => ({ width: String(text).length * 7 }));
  return { width, height, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

function createMockHost(): HTMLElement {
  return {
    clientWidth: 600,
    clientHeight: 600,
    appendChild: vi.fn(),
    removeChild: vi.fn()
  } as unknown as HTMLElement;
}

/** What the media store held when the first component body ran. */
interface Seen {
  images?: ImageResolver;
  icons?: IconRasterizer;
  videos?: VideoResolver;
}

const seen: Seen = {};

@Define('media-probe')
class MediaProbe extends Component {
  @Inject(MediaService) media!: MediaService;

  override render(): UiChild {
    seen.images = this.media.images;
    seen.icons = this.media.icons;
    seen.videos = this.media.videos;
    return Text({ text: 'probe' });
  }
}

function stubResolver(): ImageResolver {
  return new DefaultImageResolver({
    fetch: () => Promise.resolve(new Blob()),
    decode: () => Promise.reject(new Error('nothing decodes in a spec'))
  });
}

function stubVideoResolver(): VideoResolver {
  return {
    resolve: () => Promise.reject(new Error('nothing decodes in a spec')),
    release: () => {},
    dispose: () => {}
  };
}

afterEach(() => {
  seen.images = undefined;
  seen.icons = undefined;
  seen.videos = undefined;
});

describe('GessoApp and the media option', () => {
  it('hands the runtime the resolver, rasteriser and decoder it was given', () => {
    const resolver = stubResolver();
    const rasterizer = new IconRasterizer();
    const videoResolver = stubVideoResolver();
    const app = new GessoApp({
      host: createMockHost(),
      canvas: createMockCanvas(),
      root: createComponent(MediaProbe, {}),
      clock: callback => new UiManualFrameClock(callback),
      media: { resolver, rasterizer, videoResolver }
    });

    // Read at the moment the probe's body ran, which is inside the
    // runtime's constructor: an `Image` beside it asks for its bitmap
    // then, so anything installed later is too late.
    expect(seen.images).toBe(resolver);
    expect(seen.icons).toBe(rasterizer);
    expect(seen.videos).toBe(videoResolver);

    app.dispose();
  });

  it('builds its own when the option is left out', () => {
    const app = new GessoApp({
      host: createMockHost(),
      canvas: createMockCanvas(),
      root: createComponent(MediaProbe, {}),
      clock: callback => new UiManualFrameClock(callback)
    });

    expect(seen.images).toBeInstanceOf(DefaultImageResolver);
    expect(seen.icons).toBeInstanceOf(IconRasterizer);

    app.dispose();
  });
});

describe('createApp().useMedia', () => {
  it('forwards what it was given all the way to the first component body', () => {
    const canvas = createMockCanvas();
    // `mountSync` makes its own canvas element; there is no document in
    // a spec, so this is the whole of the one it needs.
    const document = { createElement: () => canvas };
    const host = globalThis as { document?: unknown; requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
    host.document = document;
    // `mountSync` takes the browser's frame clock, which asks the
    // global for these two the moment it is built.
    host.requestAnimationFrame = () => 0;
    host.cancelAnimationFrame = () => {};
    const resolver = stubResolver();
    const rasterizer = new IconRasterizer();
    const videoResolver = stubVideoResolver();

    try {
      const dispose = createApp(MediaProbe)
        .useMedia({ resolver, rasterizer, videoResolver })
        .mountSync(createMockHost());

      expect(seen.images).toBe(resolver);
      expect(seen.icons).toBe(rasterizer);
      expect(seen.videos).toBe(videoResolver);
      dispose();
    } finally {
      delete host.document;
      delete host.requestAnimationFrame;
      delete host.cancelAnimationFrame;
    }
  });
});

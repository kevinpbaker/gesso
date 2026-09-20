import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, FocusService, ShellService } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import {
  Box,
  Column,
  type UiChild,
  type UiNode,
  UiNodeType,
  darkTheme,
  lightTheme,
  type UiTheme,
  DefaultImageResolver,
  defineModifier,
  IconRasterizer,
  type IconCanvas,
  type IconContext,
  type UiImage,
  type UiColorValue,
  type UiVideoSurface,
  type VideoPlayback,
  type VideoResolver,
  type VideoTransport
} from 'gesso-core';
import { Icon, Image, ProgressBar, Spinner, Video } from './Media';

/**
 * The Media tier.
 *
 * The renderers are not exercised here — `UiImage` and `objectFit`
 * have been on both backends since the parity milestone and
 * `RendererParity.spec` covers them. What is new is everything in
 * front: resolving, not resolving twice, releasing what leaves the
 * tree, re-rasterising an icon when the theme under it changes, and
 * the semantics each of the four emits.
 */

/** A bitmap-shaped stand-in; `parseImage` only wants width and height. */
function fakeBitmap(width = 8, height = 8): UiImage {
  return { width, height, close: vi.fn() } as unknown as UiImage;
}

/** The first real node under a component's fragment anchor. */
function firstElement(node: UiNode): UiNode {
  let child = node.firstChild;
  while (child !== null && child.type === UiNodeType.Fragment) {
    child = child.firstChild;
  }
  if (child === null) {
    throw new Error(`No element under '${node.id}'.`);
  }
  return child;
}

/**
 * A modifier that does nothing but say where it landed.
 *
 * `rootModifiers` is a promise about *which element* a caller's
 * modifier reaches — `sharedElement` and `motion` both describe one —
 * so the assertion has to be about the node, not about a property.
 */
const attachedTo: UiNode[] = [];
const mark = defineModifier<void>({
  name: 'mark',
  attach(host) {
    attachedTo.push(host.node);
  }
});

function semanticsOf(node: UiNode): Record<string, unknown> {
  return {
    role: node.properties.get('role'),
    label: node.properties.get('label'),
    valueNow: node.properties.get('valueNow'),
    states: node.properties.get('states')
  };
}

describe('DefaultImageResolver', () => {
  it('fetches and decodes once for two callers of one source', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(new Blob()));
    const decode = vi.fn(() => Promise.resolve(fakeBitmap()));
    const resolver = new DefaultImageResolver({ fetch: fetchBlob, decode });

    const [a, b] = await Promise.all([resolver.resolve('one.png'), resolver.resolve('one.png')]);

    expect(a).toBe(b);
    expect(fetchBlob).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('keeps a bitmap something is still holding, whatever the capacity says', async () => {
    const resolver = new DefaultImageResolver({
      capacity: 1,
      fetch: () => Promise.resolve(new Blob()),
      decode: () => Promise.resolve(fakeBitmap())
    });
    const held = await resolver.resolve('held.png');
    await resolver.resolve('a.png');
    await resolver.resolve('b.png');

    // Two released sources overflow a capacity of one; the held one is
    // not a candidate at all.
    resolver.release('a.png');
    resolver.release('b.png');

    expect(await resolver.resolve('held.png')).toBe(held);
    expect((held as unknown as { close: () => void }).close).not.toHaveBeenCalled();
  });

  it('closes a bitmap the cache evicts, because a decoded one holds pixels', async () => {
    const bitmaps = [fakeBitmap(), fakeBitmap()];
    let next = 0;
    const resolver = new DefaultImageResolver({
      capacity: 1,
      fetch: () => Promise.resolve(new Blob()),
      decode: () => Promise.resolve(bitmaps[next++])
    });
    await resolver.resolve('a.png');
    await resolver.resolve('b.png');

    resolver.release('a.png');
    resolver.release('b.png');

    expect((bitmaps[0] as unknown as { close: () => void }).close).toHaveBeenCalled();
    expect((bitmaps[1] as unknown as { close: () => void }).close).not.toHaveBeenCalled();
  });

  it('answers a decoded source at once from peek, holding it, and has nothing to say about one in flight', async () => {
    const bitmap = fakeBitmap();
    const resolver = new DefaultImageResolver({
      capacity: 0,
      fetch: () => Promise.resolve(new Blob()),
      decode: () => Promise.resolve(bitmap)
    });
    expect(resolver.peek('a.png')).toBeNull();
    const pending = resolver.resolve('a.png');
    expect(resolver.peek('a.png'), 'in flight is not decoded').toBeNull();
    await pending;

    expect(resolver.peek('a.png')).toBe(bitmap);
    // Two holders now: the resolve and the peek. One release keeps it.
    resolver.release('a.png');
    expect(resolver.peek('a.png')).toBe(bitmap);
    // The peek held it again, so two releases are needed before a
    // capacity of nothing can evict it.
    resolver.release('a.png');
    resolver.release('a.png');
    expect(resolver.peek('a.png')).toBeNull();
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('does not cache a failure, so the next caller tries again', async () => {
    let attempts = 0;
    const resolver = new DefaultImageResolver({
      fetch: () => {
        attempts++;
        return attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(new Blob());
      },
      decode: () => Promise.resolve(fakeBitmap())
    });

    await expect(resolver.resolve('flaky.png')).rejects.toThrow('offline');
    await expect(resolver.resolve('flaky.png')).resolves.toBeDefined();
    expect(attempts).toBe(2);
  });
});

/** A canvas that records what was drawn instead of drawing it. */
function recordingRasterizer(): { rasterizer: IconRasterizer; fills: string[]; strokes: string[] } {
  const fills: string[] = [];
  const strokes: string[] = [];
  const createCanvas = (): IconCanvas => {
    const ctx: IconContext = {
      scale: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      fill: () => fills.push(ctx.fillStyle),
      stroke: () => strokes.push(ctx.strokeStyle)
    };
    return { getContext2D: () => ctx, toBitmap: () => Promise.resolve(fakeBitmap()) };
  };
  return { rasterizer: new IconRasterizer({ createCanvas }), fills, strokes };
}

describe('IconRasterizer', () => {
  beforeEach(() => {
    // `new Path2D(d)` is a platform type the recording canvas never
    // looks at; the rasteriser still constructs one.
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(readonly d: string) {}
    };
  });
  afterEach(() => {
    delete (globalThis as { Path2D?: unknown }).Path2D;
  });

  it('rasterises once per distinct icon and re-rasterises for a different colour', async () => {
    const { rasterizer, fills } = recordingRasterizer();
    const base = { path: 'M0 0h24v24H0z', viewBox: 24, size: 16, style: 'fill' as const, strokeWidth: 2 };
    const red = { ...base, color: { r: 1, g: 0, b: 0, a: 1 } };
    const blue = { ...base, color: { r: 0, g: 0, b: 1, a: 1 } };

    await Promise.all([rasterizer.raster(red), rasterizer.raster(red), rasterizer.raster(blue)]);

    // The colour is baked into the raster, which is exactly why an icon
    // has to be redrawn when the theme under it changes.
    expect(fills).toEqual(['#f00', '#00f']);
    expect(rasterizer.size).toBe(2);
  });
});

/**
 * A runtime whose resolver is controllable.
 *
 * Through the `media` option and not through the store afterwards: the
 * tree is built inside the runtime's constructor and an `Image` in it
 * asks for its bitmap right then, so a resolver installed later would
 * already have missed the first screen. That is a real constraint on
 * an app, not a testing detail, which is why the option exists.
 */
function mountMedia(root: UiChild, options: { decode?: () => Promise<UiImage> } = {}) {
  const bitmap = fakeBitmap(40, 20);
  const resolver = new DefaultImageResolver({
    fetch: () => Promise.resolve(new Blob()),
    decode: options.decode ?? (() => Promise.resolve(bitmap))
  });
  const mounted = renderTest(root, { media: { resolver } });
  return { ...mounted, bitmap, resolver };
}

describe('Image', () => {
  it('writes the decoded bitmap onto its node, and is named by its alt text', async () => {
    let node: UiNode | null = null;
    const mounted = mountMedia(
      Column(
        {},
        createComponent(Image, {
          src: 'photo.png',
          alt: 'A photograph',
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20
        })
      )
    );

    expect(node!.properties.get('image')).toBeUndefined();
    await mounted.settle();

    expect(node!.properties.get('image')).toBe(mounted.bitmap);
    expect(semanticsOf(node!)).toMatchObject({ role: 'image', label: 'A photograph' });
  });

  it('draws a picture the resolver already holds on the frame that builds the node', async () => {
    // The bar's cover and the sheet's cover are one url: when the sheet
    // opens, its picture is decoded already. A promise would still put
    // it on the node a microtask after the first frame painted, and
    // that frame is the first of a shared-element morph, so the
    // placeholder would be a blank tile where the picture was.
    const bitmap = fakeBitmap(40, 20);
    const resolver = new DefaultImageResolver({
      fetch: () => Promise.resolve(new Blob()),
      decode: () => Promise.resolve(bitmap)
    });
    await resolver.resolve('photo.png');
    resolver.release('photo.png');

    let node: UiNode | null = null;
    renderTest(
      Column(
        {},
        createComponent(Image, { src: 'photo.png', ref: (n: UiNode | null) => (node = n), width: 40, height: 20 })
      ),
      { media: { resolver } }
    );

    // No settle: the bitmap is there when renderTest returns from the first frame.
    expect(node!.properties.get('image')).toBe(bitmap);
  });

  it('is decorative without an alt: no role, so it is not in the semantics tree', () => {
    let node: UiNode | null = null;
    mountMedia(Column({}, createComponent(Image, { src: 'bullet.png', ref: (n: UiNode | null) => (node = n) })));

    expect(node!.properties.get('role')).toBeUndefined();
    expect(node!.properties.get('label')).toBeUndefined();
  });

  it('tints the placeholder with the colour it was given, and drops it when the bitmap arrives', async () => {
    let node: UiNode | null = null;
    const mounted = mountMedia(
      Column(
        {},
        createComponent(Image, {
          src: 'photo.png',
          alt: 'A photograph',
          placeholderColor: 'danger',
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20
        })
      )
    );

    // A tint while it decodes, so a grid of thumbnails does not jump
    // as they arrive, and nothing once the picture is there to cover
    // it.
    expect(node!.properties.get('backgroundColor')).toBe('danger');
    await mounted.settle();
    expect(node!.properties.get('backgroundColor')).toBeUndefined();
  });

  it('falls back to the theme tint when no placeholder colour is given', () => {
    let node: UiNode | null = null;
    mountMedia(
      Column({}, createComponent(Image, { src: 'photo.png', ref: (n: UiNode | null) => (node = n), width: 40 }))
    );

    expect(node!.properties.get('backgroundColor')).toBe('controlBackground');
  });

  it('follows a src that changes: loads the new picture and releases the old', async () => {
    const src = new BehaviorSubject('one.png');
    const fetched: string[] = [];
    const resolver = new DefaultImageResolver({
      capacity: 0,
      fetch: source => {
        fetched.push(source);
        return Promise.resolve(new Blob());
      },
      decode: () => Promise.resolve(fakeBitmap())
    });
    let node: UiNode | null = null;
    const mounted = renderTest(
      Column({}, createComponent(Image, { src, alt: 'A', ref: (n: UiNode | null) => (node = n) })),
      { media: { resolver } }
    );
    mounted.frame();
    await mounted.settle();
    const first = node!.properties.get('image');
    expect(first).toBeDefined();

    src.next('two.png');
    mounted.frame();
    // The old picture is cleared at once, so a stale one never shows
    // over a new source, and released; the new one arrives.
    expect(node!.properties.get('image')).toBeUndefined();
    await mounted.settle();
    expect(node!.properties.get('image')).toBeDefined();
    expect(node!.properties.get('image')).not.toBe(first);
    expect(fetched).toEqual(['one.png', 'two.png']);
    expect(resolver.size).toBe(1);

    // The same url again is not a reload.
    src.next('two.png');
    mounted.frame();
    expect(fetched).toEqual(['one.png', 'two.png']);
  });

  it('tries the next source when one fails, and reports failure only when all have', async () => {
    const fetched: string[] = [];
    const resolver = new DefaultImageResolver({
      fetch: source => {
        fetched.push(source);
        return source.includes('down') ? Promise.reject(new Error('502')) : Promise.resolve(new Blob());
      },
      decode: () => Promise.resolve(fakeBitmap())
    });
    let node: UiNode | null = null;
    const mounted = renderTest(
      Column(
        {},
        createComponent(Image, {
          src: ['https://down.example/a.jpg', 'https://also-down.example/a.jpg', 'https://up.example/a.jpg'],
          alt: 'A',
          ref: (n: UiNode | null) => (node = n)
        })
      ),
      { media: { resolver } }
    );
    mounted.frame();
    await mounted.settle();

    expect(fetched).toEqual([
      'https://down.example/a.jpg',
      'https://also-down.example/a.jpg',
      'https://up.example/a.jpg'
    ]);
    expect(node!.properties.get('image')).toBeDefined();
    // Only the one that answered is held.
    expect(resolver.size).toBe(1);

    let failed: UiNode | null = null;
    const hopeless = renderTest(
      Column(
        {},
        createComponent(Image, {
          src: ['https://down.example/b.jpg'],
          alt: 'B',
          placeholderColor: 'danger',
          ref: (n: UiNode | null) => (failed = n)
        })
      ),
      { media: { resolver } }
    );
    hopeless.frame();
    await hopeless.settle();
    expect(failed!.properties.get('image')).toBeUndefined();
    expect(failed!.properties.get('backgroundColor')).toBe('danger');
  });

  it('releases the bitmap when its row leaves the tree', async () => {
    const resolver = new DefaultImageResolver({
      capacity: 0,
      fetch: () => Promise.resolve(new Blob()),
      decode: () => Promise.resolve(fakeBitmap())
    });
    const children = new BehaviorSubject<UiChild>(
      Box({ key: 'shown' }, createComponent(Image, { src: 'photo.png', alt: 'One' }))
    );
    const mounted = renderTest(Column({}, children), { media: { resolver } });
    mounted.frame();
    await mounted.settle();
    expect(resolver.size).toBe(1);

    // The list drops the row; `host.own` releases inside removeSubtree,
    // and with no room to cache it the bitmap goes with it.
    children.next(Box({ key: 'gone' }));
    mounted.frame();

    expect(resolver.size).toBe(0);
  });
});

/**
 * A playback that produces nothing, because nothing here looks at a
 * frame: the subject is the box behind one.
 */
class FakePlayback implements VideoPlayback {
  readonly surface: UiVideoSurface = { frame: null, version: 0, width: 4, height: 4 };
  readonly width = 4;
  readonly height = 4;
  readonly duration = 4;
  readonly frameDurationMs = 100;
  positionMs = 0;
  /** Every position it was asked for, which is how the specs below read time. */
  readonly presented: number[] = [];
  private readonly listeners = new Set<(error: unknown) => void>();

  present(positionMs: number): boolean {
    this.positionMs = positionMs;
    this.presented.push(positionMs);
    return true;
  }

  onError(listener: (error: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** What a decoder giving up part-way through the clip looks like. */
  fail(error: unknown): void {
    for (const listener of this.listeners) {
      listener(error);
    }
  }
}

/**
 * A runtime whose video resolver answers, or refuses.
 *
 * Through the `media` option for the reason `mountMedia` uses it: a
 * `Video` asks for its playback while the tree is being built inside
 * the runtime's constructor.
 */
function mountVideo(root: UiChild, options: { fails?: boolean } = {}) {
  const playback = new FakePlayback();
  const resolver: VideoResolver = {
    resolve: () => (options.fails === true ? Promise.reject(new Error('no decoder')) : Promise.resolve(playback)),
    release: () => {},
    dispose: () => {}
  };
  // An image resolver as well, for the poster: a `Video` given one
  // carries both, and the default resolver has no network here.
  const images = new DefaultImageResolver({
    fetch: () => Promise.resolve(new Blob()),
    decode: () => Promise.resolve(fakeBitmap(40, 20))
  });
  const mounted = renderTest(root, { media: { videoResolver: resolver, resolver: images } });
  return { ...mounted, playback };
}

describe('Video', () => {
  it('tints the placeholder with the colour it was given, and drops it when the clip starts', async () => {
    let node: UiNode | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          placeholderColor: 'danger',
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20
        })
      )
    );

    // The same promise `Image` waits on: nothing is on the node yet, so
    // the box is the caller's colour rather than the theme's.
    expect(node!.properties.get('backgroundColor')).toBe('danger');
    await mounted.settle();
    expect(node!.properties.get('backgroundColor')).toBeUndefined();
  });

  it('falls back to the theme tint when no placeholder colour is given', () => {
    let node: UiNode | null = null;
    mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', ref: (n: UiNode | null) => (node = n), width: 40 }))
    );

    expect(node!.properties.get('backgroundColor')).toBe('controlBackground');
  });

  it('keeps the given tint when the source cannot be read at all', async () => {
    let node: UiNode | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          placeholderColor: 'danger',
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20
        })
      ),
      { fails: true }
    );
    await mounted.settle();

    // A thread with no `VideoDecoder`, a fragmented file, a fetch that
    // failed: the tinted box is the whole of what any of them looks
    // like.
    expect(node!.properties.get('video')).toBeUndefined();
    expect(node!.properties.get('backgroundColor')).toBe('danger');
  });

  it('hands out a transport once there is a playback to drive', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          onTransport: (next: VideoTransport) => (transport = next),
          width: 40,
          height: 20
        })
      )
    );

    // Not before: a playback does not exist until a file has been
    // fetched and a decoder configured.
    expect(transport).toBeNull();
    await mounted.settle();

    expect(transport).not.toBeNull();
    expect(transport!.duration).toBe(4);
    expect(transport!.paused).toBe(false);
    expect(transport!.rate).toBe(1);
  });

  it('starts paused when it was told not to autoplay, and plays when asked', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          autoplay: false,
          onTransport: (next: VideoTransport) => (transport = next),
          width: 40,
          height: 20
        })
      )
    );
    await mounted.settle();
    expect(transport!.paused).toBe(true);

    mounted.playback.presented.length = 0;
    mounted.frame(100);
    mounted.frame(200);
    // Time is not moving, so nothing is asked for.
    expect(mounted.playback.presented).toEqual([]);

    transport!.play();
    expect(transport!.paused).toBe(false);
    mounted.frame(300);
    mounted.frame(400);
    expect(mounted.playback.presented.length).toBeGreaterThan(0);
  });

  it('stops asking for pictures once it is paused, and starts again on play', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          onTransport: (next: VideoTransport) => (transport = next),
          width: 40,
          height: 20
        })
      )
    );
    await mounted.settle();

    mounted.frame(100);
    mounted.frame(200);
    transport!.pause();
    mounted.playback.presented.length = 0;

    mounted.frame(300);
    mounted.frame(400);
    expect(mounted.playback.presented).toEqual([]);

    transport!.play();
    mounted.frame(500);
    mounted.frame(600);
    expect(mounted.playback.presented.length).toBeGreaterThan(0);
  });

  it('moves the picture on a seek even while paused', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          autoplay: false,
          onTransport: (next: VideoTransport) => (transport = next),
          width: 40,
          height: 20
        })
      )
    );
    await mounted.settle();
    mounted.playback.presented.length = 0;

    transport!.seek(2.5);

    // Written straight through rather than waiting for a frame the
    // tween is never going to sample: a scrubber dragged on a paused
    // clip is the whole reason `seek` exists.
    expect(mounted.playback.presented).toEqual([2500]);
    expect(transport!.position).toBe(2.5);
    expect(transport!.paused).toBe(true);
  });

  it('clamps a seek to the clip rather than running off either end', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          // Paused, so the clamp is the only thing moving the
          // position: a *playing* clip seeked to its own end has
          // reached the end, and the test below is about that.
          autoplay: false,
          onTransport: (n: VideoTransport) => (transport = n)
        })
      )
    );
    await mounted.settle();

    transport!.seek(-10);
    expect(transport!.position).toBe(0);
    transport!.seek(9999);
    expect(transport!.position).toBe(4);
  });

  it('wraps to the start when a looping clip is seeked to its end', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', onTransport: (n: VideoTransport) => (transport = n) }))
    );
    await mounted.settle();

    transport!.seek(4);

    // The end of a loop is the start of it, and a clip that stopped
    // dead on its last frame having been dragged there would be a
    // looping clip that had stopped looping.
    expect(transport!.position).toBe(0);
    expect(transport!.paused).toBe(false);
  });

  it('stops on the last frame when a clip that does not loop reaches the end', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, { src: 'clip.mp4', loop: false, onTransport: (n: VideoTransport) => (transport = n) })
      )
    );
    await mounted.settle();

    transport!.seek(4);
    expect(transport!.position).toBe(4);
    expect(transport!.paused).toBe(true);

    // And playing it again starts it over, which is what every player
    // does and what showing the last frame forever would not.
    transport!.play();
    expect(transport!.position).toBe(0);
    expect(transport!.paused).toBe(false);
  });

  it('clamps a rate to something a decoder can keep up with', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', onTransport: (n: VideoTransport) => (transport = n) }))
    );
    await mounted.settle();

    transport!.setRate(100);
    expect(transport!.rate).toBe(4);
    transport!.setRate(0);
    expect(transport!.rate).toBe(0.0625);
    transport!.setRate(Number.NaN);
    expect(transport!.rate).toBe(1);
  });

  it('runs at the rate it was given', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', onTransport: (n: VideoTransport) => (transport = n) }))
    );
    await mounted.settle();

    mounted.frame(0);
    mounted.frame(1000);
    const atNormalRate = transport!.position;

    transport!.seek(0);
    transport!.setRate(2);
    mounted.frame(2000);
    mounted.frame(3000);

    // A second of frames at double speed covers twice the clip.
    expect(transport!.position).toBeCloseTo(atNormalRate * 2, 5);
  });

  it('tells a listener when the clip is acted on, and not on every frame', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', onTransport: (n: VideoTransport) => (transport = n) }))
    );
    await mounted.settle();

    let changes = 0;
    const stop = transport!.onChange(() => changes++);

    mounted.frame(100);
    mounted.frame(200);
    // Position moves every frame and is deliberately not a change: a
    // listener woken sixty times a second to move a scrubber by a
    // pixel is how a video costs an application its frame budget.
    expect(changes).toBe(0);

    transport!.pause();
    transport!.play();
    expect(changes).toBe(2);

    stop();
    transport!.pause();
    expect(changes).toBe(2);
  });

  /**
   * Drives a clip that is simply playing, which `frame()` alone cannot.
   *
   * A video declares its own frame interval, so between pictures the
   * runtime is asleep on a timer rather than asking for frames it
   * would draw nothing on — `clock.isPending` is false and `frame()`
   * is a no-op. So the timers have to be fake from the start, and the
   * clip is advanced by letting its interval elapse before each frame.
   * `VideoExample.spec` drives the documentation's clips the same way
   * and says the same thing about why.
   */
  async function play(mounted: ReturnType<typeof mountVideo>, frames: number): Promise<number[]> {
    await vi.advanceTimersByTimeAsync(0);
    mounted.playback.presented.length = 0;
    for (let index = 1; index <= frames; index++) {
      await vi.advanceTimersByTimeAsync(100);
      mounted.frame(index * 100);
    }
    return mounted.playback.presented;
  }

  it('does not decode for a clip scrolled past the bottom of the page', async () => {
    vi.useFakeTimers();
    try {
      const mounted = mountVideo(
        Column(
          {},
          // Taller than the 600 the test surface is, and refusing to
          // shrink to it, so the clip below is laid out somewhere
          // nobody can see. Without `flexShrink: 0` the column fits
          // the spacer to the surface and the clip stays in view,
          // which is a test that passes for the wrong reason.
          Box({ height: 900, flexShrink: 0 }),
          // The clip refuses to shrink too: an over-full column
          // squeezes its last child to nothing, and a clip laid out to
          // zero height is one this modifier deliberately treats as
          // unmeasured rather than as hidden.
          createComponent(Video, { src: 'clip.mp4', width: 40, height: 20, flexShrink: 0 })
        )
      );

      // A page of clips used to cost the sum of all of them however
      // few were on screen. The position is left exactly where it
      // stopped, so coming back into view resumes rather than reloads.
      expect(await play(mounted, 3)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('decodes for a clip that is on screen', async () => {
    vi.useFakeTimers();
    try {
      const mounted = mountVideo(
        Column({}, Box({ height: 100 }), createComponent(Video, { src: 'clip.mp4', width: 40, height: 20 }))
      );

      expect((await play(mounted, 3)).length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps decoding off screen when it was told to', async () => {
    vi.useFakeTimers();
    try {
      const mounted = mountVideo(
        Column(
          {},
          Box({ height: 900, flexShrink: 0 }),
          createComponent(Video, { src: 'clip.mp4', pauseWhenHidden: false, width: 40, height: 20, flexShrink: 0 })
        )
      );

      // For a clip being drawn somewhere the layout cannot account
      // for: into a shared element mid-flight, or off screen on
      // purpose so it is warm when it arrives.
      expect((await play(mounted, 3)).length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws a poster under the clip until there is a frame', async () => {
    let node: UiNode | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          poster: 'still.png',
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20
        })
      )
    );
    await mounted.settle();

    // Both sit on the node: a renderer draws the video's frame where
    // there is one and falls back to the image where there is not, so
    // the poster is also what a clip that failed mid-stream shows.
    expect(node!.properties.get('image')).toBeDefined();
    expect(node!.properties.get('video')).toBe(mounted.playback.surface);
  });

  it('draws no controls unless it is asked for them', async () => {
    const mounted = mountVideo(Column({}, createComponent(Video, { src: 'clip.mp4', width: 40, height: 20 })));
    await mounted.settle();

    // A `Video` is as often a background or a texture as it is
    // something to watch, and chrome over one of those is noise.
    expect(mounted.queryByRole('toolbar')).toBeNull();
    expect(mounted.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('draws a transport over the picture when it is', async () => {
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', alt: 'A clip', controls: true, width: 360, height: 200 }))
    );
    await mounted.settle();

    // `Video` autoplays, so the button offers the action that is
    // available rather than the one already taken.
    expect(mounted.getByRole('toolbar', { name: 'Video controls' })).toBeTruthy();
    expect(mounted.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(mounted.getByRole('slider', { name: 'Seek' })).toBeTruthy();
  });

  it('becomes a group rather than an image once it carries controls', async () => {
    let node: UiNode | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          controls: true,
          ref: (n: UiNode | null) => (node = n),
          width: 360,
          height: 200
        })
      )
    );
    await mounted.settle();

    // A rectangle showing a picture is an image. One that also carries
    // a toolbar is not: announcing it as an image would hide the
    // controls behind a leaf.
    expect(mounted.getSemantics(node!).role).toBe('group');
    expect(mounted.getByRole('group', { name: 'A clip' })).toBe(node);
    expect(mounted.queryByRole('image')).toBeNull();
  });

  it('runs the scrubber along the top edge of the bar, the whole width of it', async () => {
    let node: UiNode | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          controls: true,
          ref: (n: UiNode | null) => (node = n),
          width: 360,
          height: 200
        })
      )
    );
    await mounted.settle();

    const video = mounted.getLayout(node!);
    const bar = mounted.getLayout(mounted.getByRole('toolbar'));
    const seek = mounted.getLayout(mounted.getByRole('slider', { name: 'Seek' }));

    // Edge to edge, and sitting on the boundary between the picture
    // and the controls under it: the line is where the clip stops
    // and the chrome starts, so any inset would read as a mistake.
    expect(bar.width).toBe(video.width);
    expect(seek.width).toBe(bar.width);
    expect(seek.x).toBe(bar.x);
    expect(seek.y).toBe(bar.y);
  });

  it('plays and pauses from the bar', async () => {
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          controls: true,
          autoplay: false,
          width: 360,
          height: 200
        })
      )
    );
    await mounted.settle();

    mounted.fireEvent.click(mounted.getByRole('button', { name: 'Play' }));
    await mounted.settle();
    expect(mounted.getByRole('button', { name: 'Pause' })).toBeTruthy();

    mounted.fireEvent.click(mounted.getByRole('button', { name: 'Pause' }));
    await mounted.settle();
    expect(mounted.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('changes the play glyph and not just its name', async () => {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(readonly d: string) {}
    };
    try {
      const { rasterizer } = recordingRasterizer();
      const playback = new FakePlayback();
      const videoResolver: VideoResolver = {
        resolve: () => Promise.resolve(playback),
        release: () => {},
        dispose: () => {}
      };
      const mounted = renderTest(
        Column(
          {},
          createComponent(Video, {
            src: 'clip.mp4',
            alt: 'A clip',
            controls: true,
            autoplay: false,
            width: 360,
            height: 200
          })
        ),
        { media: { videoResolver, rasterizer } }
      );
      await mounted.settle();

      // The rasteriser caches one entry per distinct glyph, so a new
      // entry is a new picture actually drawn. `Button` reads
      // `children` once by value, so an observable of elements is
      // sampled when the button is built and never again: the name
      // changed and the glyph did not.
      const drawn = rasterizer.size;
      expect(drawn).toBeGreaterThan(0);

      mounted.fireEvent.click(mounted.getByRole('button', { name: 'Play' }));
      await mounted.settle();

      expect(mounted.getByRole('button', { name: 'Pause' })).toBeTruthy();
      expect(rasterizer.size).toBeGreaterThan(drawn);
    } finally {
      delete (globalThis as { Path2D?: unknown }).Path2D;
    }
  });

  it('fills the screen with the clip, not merely with the application', async () => {
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          controls: true,
          autoplay: false,
          width: 360,
          height: 200
        })
      )
    );
    await mounted.settle();

    const shell = mounted.runtime.services.get(ShellService);
    const asked: boolean[] = [];
    mounted.runtime.onShellRequest(request => {
      if (request.type === 'fullscreen') {
        asked.push(request.enter);
      }
    });

    mounted.fireEvent.click(mounted.getByRole('button', { name: 'Fullscreen' }));
    await mounted.settle();

    // The shell is asked, because the canvas is the only real element
    // there is and something has to fill the screen.
    expect(asked).toEqual([true]);
    // But asking is only half of it: until the shell says it happened,
    // nothing is drawn over anything.
    expect(mounted.getAllByRole('group', { name: 'A clip' })).toHaveLength(1);

    shell.applyFullscreen(true);
    await mounted.settle();

    // Now there are two: the clip in place, and a copy pinned to every
    // edge of the viewport. They share one playback, because playback
    // is reference counted by source.
    expect(mounted.getAllByRole('group', { name: 'A clip' })).toHaveLength(2);

    shell.applyFullscreen(false);
    await mounted.settle();
    expect(mounted.getAllByRole('group', { name: 'A clip' })).toHaveLength(1);
  });

  it('takes the copy away when the person leaves fullscreen by some other means', async () => {
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', alt: 'A clip', controls: true, width: 360, height: 200 }))
    );
    await mounted.settle();
    const shell = mounted.runtime.services.get(ShellService);

    mounted.fireEvent.click(mounted.getByRole('button', { name: 'Fullscreen' }));
    shell.applyFullscreen(true);
    await mounted.settle();
    expect(mounted.getAllByRole('group', { name: 'A clip' })).toHaveLength(2);

    // Escape leaves fullscreen without telling anyone who asked, and a
    // copy left on the overlay would then cover an application that is
    // no longer filling the screen.
    shell.applyFullscreen(false);
    await mounted.settle();
    expect(mounted.getAllByRole('group', { name: 'A clip' })).toHaveLength(1);
  });

  it('does not put a clip on the overlay because some other thing went fullscreen', async () => {
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', alt: 'A clip', controls: true, width: 360, height: 200 }))
    );
    await mounted.settle();

    // The shell's flag is the whole application's, and this clip did
    // not ask.
    mounted.runtime.services.get(ShellService).applyFullscreen(true);
    await mounted.settle();

    expect(mounted.getAllByRole('group', { name: 'A clip' })).toHaveLength(1);
  });

  it('draws its glyphs in its own ink rather than the theme control colour', async () => {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(readonly d: string) {}
    };
    try {
      const { rasterizer, fills } = recordingRasterizer();
      const playback = new FakePlayback();
      const videoResolver: VideoResolver = {
        resolve: () => Promise.resolve(playback),
        release: () => {},
        dispose: () => {}
      };
      const mounted = renderTest(
        Column(
          {},
          createComponent(Video, {
            src: 'clip.mp4',
            alt: 'A clip',
            controls: true,
            onVolume: () => {},
            width: 360,
            height: 200
          })
        ),
        { media: { videoResolver, rasterizer } }
      );
      await mounted.settle();

      // The bar sits on a plate over a picture, and the theme cannot
      // know what is behind it. `Icon` defaults to `controlForeground`,
      // which took the theme's control ink and disappeared wherever
      // that was dark: in fullscreen it vanished outright, because the
      // overlay layer inherits no theme and falls back to the light
      // one.
      expect(fills.length).toBeGreaterThan(0);
      expect(fills.every(fill => fill === '#fff')).toBe(true);
    } finally {
      delete (globalThis as { Path2D?: unknown }).Path2D;
    }
  });

  it('keeps the bar hidden until the pointer is over the clip', async () => {
    let node: UiNode | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          controls: true,
          // Paused, which used to be enough to keep the bar up on its
          // own: every clip that had not been started yet wore its
          // chrome permanently, which is not what a bar that hides
          // itself is for.
          autoplay: false,
          ref: (n: UiNode | null) => (node = n),
          width: 360,
          height: 200
        })
      )
    );
    await mounted.settle();

    const bar = mounted.getByRole('toolbar');
    expect(bar.properties.get('opacity')).toBe(0);

    const box = mounted.getLayout(node!);
    mounted.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
    await mounted.settle();
    expect(bar.properties.get('opacity')).toBe(1);

    mounted.fireEvent.pointerMove(box.x + box.width + 40, box.y + box.height + 40);
    await mounted.settle();
    expect(bar.properties.get('opacity')).toBe(0);
  });

  it('keeps the bar up while something inside it has the keyboard', async () => {
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', alt: 'A clip', controls: true, width: 360, height: 200 }))
    );
    await mounted.settle();

    const bar = mounted.getByRole('toolbar');
    expect(bar.properties.get('opacity')).toBe(0);

    // Tabbing into a bar that then hid itself would move focus
    // somewhere nobody can see, which is the one thing the hover rule
    // on its own gets wrong.
    mounted.runtime.services.get(FocusService).focus(mounted.getByRole('slider', { name: 'Seek' }));
    await mounted.settle();
    expect(bar.properties.get('opacity')).toBe(1);
  });

  it('leaves out the parts it was told to leave out', async () => {
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          controls: { scrubber: false, time: false },
          autoplay: false,
          width: 360,
          height: 200
        })
      )
    );
    await mounted.settle();

    expect(mounted.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(mounted.queryByRole('slider', { name: 'Seek' })).toBeNull();
  });

  it('draws no volume control for a clip whose sound is not wired', async () => {
    const mounted = mountVideo(
      Column({}, createComponent(Video, { src: 'clip.mp4', alt: 'A clip', controls: true, width: 360, height: 200 }))
    );
    await mounted.settle();

    // Nothing here plays a clip's sound, so a level slider over
    // silence would be a lie.
    expect(mounted.queryByRole('slider', { name: 'Volume' })).toBeNull();
    expect(mounted.queryByRole('button', { name: 'Mute' })).toBeNull();
  });

  it('draws one, and reports it, for a clip whose sound is', async () => {
    const levels: [number, boolean][] = [];
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          controls: true,
          onVolume: (volume: number, muted: boolean) => levels.push([volume, muted]),
          width: 360,
          height: 200
        })
      )
    );
    await mounted.settle();

    expect(mounted.getByRole('slider', { name: 'Volume' })).toBeTruthy();
    mounted.fireEvent.click(mounted.getByRole('button', { name: 'Mute' }));
    await mounted.settle();

    expect(levels).toEqual([[1, true]]);
    expect(mounted.getByRole('button', { name: 'Unmute' })).toBeTruthy();
  });

  it('keeps the level behind a mute so unmuting returns to it', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          controls: true,
          volume: 0.4,
          onVolume: () => {},
          onTransport: (next: VideoTransport) => (transport = next)
        })
      )
    );
    await mounted.settle();

    transport!.setMuted(true);
    // A mute that wrote zero would have thrown the level away.
    expect(transport!.volume).toBe(0.4);
    transport!.setMuted(false);
    expect(transport!.volume).toBe(0.4);
  });

  it('unmutes when the level is dragged up, and does not mute when it is dragged to zero', async () => {
    let transport: VideoTransport | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          controls: true,
          onVolume: () => {},
          onTransport: (next: VideoTransport) => (transport = next)
        })
      )
    );
    await mounted.settle();

    transport!.setMuted(true);
    transport!.setVolume(0.7);
    // Dragging a slider up from zero is a request to hear it.
    expect(transport!.muted).toBe(false);

    transport!.setVolume(0);
    // And dragging to zero is not a mute: that is what the button is
    // for, and conflating them loses the level.
    expect(transport!.muted).toBe(false);
    expect(transport!.volume).toBe(0);
  });

  it('puts the tint back when the decoder gives up, behind the surface it keeps', async () => {
    let node: UiNode | null = null;
    const mounted = mountVideo(
      Column(
        {},
        createComponent(Video, {
          src: 'clip.mp4',
          alt: 'A clip',
          placeholderColor: 'danger',
          ref: (n: UiNode | null) => (node = n),
          width: 40,
          height: 20
        })
      )
    );
    await mounted.settle();
    expect(node!.properties.get('backgroundColor')).toBeUndefined();

    mounted.playback.fail(new Error('the decoder gave up'));
    await mounted.settle();

    // The box is coloured again, but the surface stays on the node, so
    // what a reader sees is the last frame rather than the tint. That
    // is the one state of the three the tint does not describe, which
    // is why the page says so.
    expect(node!.properties.get('backgroundColor')).toBe('danger');
    expect(node!.properties.get('video')).toBe(mounted.playback.surface);
  });
});

describe('Icon', () => {
  beforeEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(readonly d: string) {}
    };
  });
  afterEach(() => {
    delete (globalThis as { Path2D?: unknown }).Path2D;
  });

  it('follows a path and a colour that change, redrawing the glyph in place', async () => {
    const { rasterizer, fills } = recordingRasterizer();
    const path = new BehaviorSubject('M0 0h24v24H0z');
    const color = new BehaviorSubject<UiColorValue>('#ff0000');
    let node: UiNode | null = null;
    const mounted = renderTest(
      Column({}, createComponent(Icon, { path, color, size: 16, ref: (n: UiNode | null) => (node = n) })),
      { media: { rasterizer } }
    );
    mounted.frame();
    await mounted.settle();
    expect(fills).toEqual(['#f00']);
    const before = node!.properties.get('image');

    color.next('#0000ff');
    mounted.frame();
    await mounted.settle();
    expect(fills).toEqual(['#f00', '#00f']);
    expect(node!.properties.get('image')).not.toBe(before);

    path.next('M12 0L24 24H0z');
    mounted.frame();
    await mounted.settle();
    expect(fills).toEqual(['#f00', '#00f', '#00f']);
    // The node is the same one throughout: no key, no rebuild.
    expect(node!.properties.get('image')).toBeDefined();
  });

  it('resolves its colour against the theme it inherits, and redraws when that changes', async () => {
    const { rasterizer, fills } = recordingRasterizer();
    const theme = new BehaviorSubject<UiTheme>(lightTheme);
    const mounted = renderTest(
      Column({ theme }, createComponent(Icon, { path: 'M0 0h24v24H0z', color: 'controlAccent', size: 16 })),
      { media: { rasterizer } }
    );
    mounted.frame();
    await mounted.settle();
    expect(fills).toHaveLength(1);

    theme.next(darkTheme);
    mounted.frame();
    await mounted.settle();

    // Two rasters, in the two palettes' accents — a raster's colour is
    // baked in, so this is the one thing in the library that cannot
    // resolve a palette name at paint.
    expect(fills).toHaveLength(2);
    expect(fills[0]).not.toBe(fills[1]);
  });
});

describe('Spinner and ProgressBar', () => {
  it('a spinner is a busy status and turns from one cell, on the ticks phase', () => {
    vi.useFakeTimers();
    try {
      let node: UiNode | null = null;
      const mounted = renderTest(Column({ ref: (n: UiNode | null) => (node = n) }, createComponent(Spinner, {})));
      mounted.frame(0);
      const spinner = firstElement(node!);
      expect(semanticsOf(spinner)).toMatchObject({ role: 'status', label: 'Loading', states: ['busy'] });
      const first = spinner.properties.get('transform');

      // The runtime waits out the spinner's step with a timer rather
      // than taking a frame it would draw nothing on, so the fake
      // timers have to run before a frame is even pending.
      vi.advanceTimersByTime(400);
      mounted.frame(400);

      expect(spinner.properties.get('transform')).not.toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("attaches a caller's rootModifiers to the element each of them draws", () => {
    attachedTo.length = 0;
    let spinnerHost: UiNode | null = null;
    let barHost: UiNode | null = null;
    const mounted = renderTest(
      Column(
        {},
        Column(
          { ref: (n: UiNode | null) => (spinnerHost = n) },
          createComponent(Spinner, { rootModifiers: [mark(undefined)] })
        ),
        Column(
          { ref: (n: UiNode | null) => (barHost = n) },
          createComponent(ProgressBar, { value: 0.5, rootModifiers: [mark(undefined)] })
        )
      )
    );
    mounted.frame();

    // A component's own node is its anchor fragment, which has no box
    // and takes no modifier, so `rootModifiers` is the only way a
    // `sharedElement` or a `motion` can reach either of these.
    expect(attachedTo).toContain(firstElement(spinnerHost!));
    expect(attachedTo).toContain(firstElement(barHost!));
  });

  it('a determinate bar reports its value; an indeterminate one reports busy and no value', () => {
    let determinate: UiNode | null = null;
    let indeterminate: UiNode | null = null;
    const mounted = renderTest(
      Column(
        {},
        Column(
          { ref: (n: UiNode | null) => (determinate = n) },
          createComponent(ProgressBar, { value: 0.25, label: 'Upload' })
        ),
        Column({ ref: (n: UiNode | null) => (indeterminate = n) }, createComponent(ProgressBar, { label: 'Working' }))
      )
    );
    mounted.frame();

    expect(semanticsOf(firstElement(determinate!))).toMatchObject({
      role: 'progressbar',
      label: 'Upload',
      valueNow: 0.25
    });
    // ARIA omits aria-valuenow while indeterminate rather than
    // reporting zero, which would be a different and stronger claim.
    expect(semanticsOf(firstElement(indeterminate!))).toMatchObject({
      role: 'progressbar',
      label: 'Working',
      valueNow: undefined,
      states: ['busy']
    });
  });
});

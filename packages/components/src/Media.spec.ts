import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
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
  type UiImage
} from '@gesso/core';
import { Icon, Image, ProgressBar, Spinner } from './Media';

/**
 * The Media tier (`COMPONENTS_ROADMAP.md` C7).
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

describe('Icon', () => {
  beforeEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(readonly d: string) {}
    };
  });
  afterEach(() => {
    delete (globalThis as { Path2D?: unknown }).Path2D;
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

/**
 * Pre-scaled copies of images, kept at the size they are drawn.
 *
 * `drawImage` with a destination size that differs from the source
 * resamples, and whether that is free depends entirely on the engine.
 * Chromium records the call and lets the GPU sample it, so a
 * 1280x992 bitmap drawn at 1000x800 costs nothing measurable.
 * Gecko resamples on the CPU, on whichever thread issued the call,
 * and the same draw costs about 1.8ms. Measured in a worker
 * `OffscreenCanvas` on Firefox 154:
 *
 * | draw                              | Firefox | Chrome |
 * | --------------------------------- | ------- | ------ |
 * | 1280x992 bitmap at 1000x800       | 1.80ms  | 0.00ms |
 * | 1000x800 bitmap at 1000x800       | 0.10ms  | 0.00ms |
 *
 * The cost tracks destination pixels, at roughly 2.2ns each, so it
 * is not the size of the source that hurts but the resample itself:
 * the same bitmap drawn small is cheap, and a bitmap that needs no
 * resample is cheap at any size. A screen that is mostly artwork
 * therefore spends its whole frame budget in `drawImage`, which on
 * the transitions example was 11.5ms of an 11.6ms frame.
 *
 * So this keeps, per source image, one copy at the device size that
 * image was last drawn at, and hands that copy back instead. The
 * draw becomes 1:1 and the resample happens once rather than sixty
 * times a second. Chromium pays a single blit per size and is
 * otherwise unaffected, which is the reason this is not conditioned
 * on the engine: an engine check would be a second thing to be
 * wrong about, and there is nothing to gain by skipping it.
 *
 * **Sizes are device pixels, not layout pixels.** A copy is only
 * worth having if the draw it serves needs no resample, and that is
 * a fact about the backing store: the same box is a different number
 * of pixels at a different device pixel ratio, and again under a
 * node transform that scales.
 */

/** What a cached copy is worth having for. */
interface ScaledImageEntry {
  /** The source these pixels came from, for eviction to identify. */
  source: ImageBitmap;
  /** The copy, at exactly `width` x `height` device pixels. */
  bitmap: ImageBitmap | null;
  width: number;
  height: number;
  /** Consecutive resolves that asked for this size. */
  stable: number;
}

/**
 * How many consecutive frames a size must hold before a copy is made.
 *
 * A morph transition scales its image every frame, so every frame
 * asks for a size no copy will ever be asked for again. Building one
 * anyway would add a blit to a frame that already had to resample,
 * making the one case that is most sensitive to frame time worse.
 * Two frames is enough to tell a settled layout from an animating
 * one, and costs an animation nothing it was not already paying.
 */
const FRAMES_BEFORE_COPY = 2;

/**
 * The largest copy worth keeping, in device pixels.
 *
 * A full-bleed image on a 3440x1440 display is about 5 megapixels
 * and 20MB as a copy, which is worth it: that image is the single
 * most expensive draw in the frame. Twice that is not, so the
 * ceiling sits above the largest real screen and below anything a
 * mistake would ask for.
 */
const MAX_COPY_PIXELS = 12_000_000;

/**
 * How many copies to keep.
 *
 * One per image visible at once, near enough. A shelf of artwork
 * scrolls new images in and old ones out, and the cost of losing a
 * copy is one resampled draw plus one blit, so this only has to be
 * large enough that a screenful does not evict itself.
 */
const MAX_ENTRIES = 48;

/** Somewhere to draw a copy: `OffscreenCanvas`, or a test double. */
export interface ScaledImageSurface {
  width: number;
  height: number;
  getContext(
    contextId: '2d'
  ): { drawImage(image: ImageBitmap, dx: number, dy: number, dw: number, dh: number): void } | null;
  transferToImageBitmap(): ImageBitmap;
}

export type ScaledImageSurfaceFactory = (width: number, height: number) => ScaledImageSurface;

function defaultSurfaceFactory(width: number, height: number): ScaledImageSurface {
  return new OffscreenCanvas(width, height) as unknown as ScaledImageSurface;
}

/**
 * Whether this environment can make a copy at all.
 *
 * `OffscreenCanvas` is the only synchronous way to resample: the
 * asynchronous `createImageBitmap(source, { resizeWidth })` cannot
 * be awaited inside a frame, and a copy that arrives a frame later
 * is a copy that arrives after the size it was made for has changed.
 */
export function canScaleImages(): boolean {
  return typeof OffscreenCanvas === 'function';
}

export class ScaledImageCache {
  /**
   * Insertion-ordered, which is what makes eviction least-recently-used:
   * a hit deletes and re-sets its key, so the oldest entry is first.
   *
   * A `Map` rather than a `WeakMap` because eviction has to be able to
   * find the entry it is dropping in order to close the copy it holds,
   * and a weak collection cannot be walked. The strong reference to the
   * source is bounded by `MAX_ENTRIES` and released on eviction.
   */
  private readonly entries = new Map<string, ScaledImageEntry>();
  /**
   * A number per source, so an entry can be keyed by picture *and*
   * size.
   *
   * One slot per source was a bug rather than a simplification. A
   * picture on screen at two sizes at once — Segue's now-playing bar
   * shows the same cover at 52px that its page shows at 340 — had the
   * two draws fight over the single slot: each in turn held the size
   * long enough to earn a copy, made it, and closed the other's. The
   * smaller one then alternated between a crisp copy and a raw
   * downsample of the source every few frames, which reads on screen as
   * the picture shimmering. `ScaledImageCache.spec.ts` pins it.
   *
   * `WeakMap`, so a source that goes away takes its id with it; the
   * entries themselves are still strongly held and evicted by count.
   */
  private readonly sourceIds = new WeakMap<ImageBitmap, number>();
  private nextSourceId = 1;
  private readonly createSurface: ScaledImageSurfaceFactory;
  private readonly enabled: boolean;

  constructor(createSurface?: ScaledImageSurfaceFactory) {
    this.enabled = createSurface !== undefined || canScaleImages();
    this.createSurface = createSurface ?? defaultSurfaceFactory;
  }

  /**
   * The image to draw for a destination of `width` x `height` device
   * pixels: a copy at that exact size when one is worth having and
   * ready, and otherwise `source` unchanged.
   *
   * Always safe to draw the result at the destination rectangle the
   * sizes came from. A copy is a resample of the same pixels, so the
   * picture is the same either way; only which of the two resamples
   * runs this frame differs.
   */
  resolve(source: ImageBitmap, width: number, height: number): ImageBitmap {
    if (!this.enabled) {
      return source;
    }
    const w = Math.round(width);
    const h = Math.round(height);
    if (w <= 0 || h <= 0 || w * h > MAX_COPY_PIXELS) {
      return source;
    }
    // Already 1:1. Copying would spend memory to save nothing, and
    // this is the common case for an icon drawn at its natural size.
    if (source.width === w && source.height === h) {
      return source;
    }
    const key = this.keyFor(source, w, h);
    const entry = this.entries.get(key);
    if (entry === undefined) {
      this.insert(key, { source, bitmap: null, width: w, height: h, stable: 1 });
      return source;
    }
    // Refresh recency whether or not a copy comes of it: an image
    // drawn every frame at a size that keeps changing is still an
    // image this cache should not evict ahead of an idle one.
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (entry.bitmap !== null) {
      return entry.bitmap;
    }
    entry.stable++;
    if (entry.stable < FRAMES_BEFORE_COPY) {
      return source;
    }
    const copy = this.copy(source, w, h);
    if (copy === null) {
      return source;
    }
    entry.bitmap = copy;
    return copy;
  }

  /** Drops every copy. Called when the renderer goes away. */
  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.bitmap?.close();
    }
    this.entries.clear();
  }

  /** How many picture-and-size pairs are tracked. For specs and the inspector. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * The cache key: this picture, at this size.
   *
   * A size that is asked for once and never again makes an entry that
   * holds no copy and is evicted by count like any other, which is why
   * a morph scaling every frame costs entries rather than copies.
   */
  private keyFor(source: ImageBitmap, width: number, height: number): string {
    let id = this.sourceIds.get(source);
    if (id === undefined) {
      id = this.nextSourceId++;
      this.sourceIds.set(source, id);
    }
    return `${id}:${width}x${height}`;
  }

  private insert(key: string, entry: ScaledImageEntry): void {
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.get(oldest.value)?.bitmap?.close();
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, entry);
  }

  /**
   * Resamples once, into a bitmap.
   *
   * Failure is not exceptional: a source that has been closed under
   * us throws here, and the honest answer is to draw the original and
   * let the next frame notice. So this reports null rather than
   * letting a frame die over an image.
   */
  private copy(source: ImageBitmap, width: number, height: number): ImageBitmap | null {
    try {
      const surface = this.createSurface(width, height);
      const context = surface.getContext('2d');
      if (context === null) {
        return null;
      }
      context.drawImage(source, 0, 0, width, height);
      return surface.transferToImageBitmap();
    } catch {
      return null;
    }
  }
}

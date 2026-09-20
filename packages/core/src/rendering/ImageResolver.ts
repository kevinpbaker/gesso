import type { UiImage } from '../properties/UiImage';

/**
 * Turns a source into something a renderer can draw.
 *
 * `UiImage` is `ImageBitmap`, which both backends already take — the
 * Canvas2D renderer draws it and the WebGPU one uploads it through
 * `WebGPUTextureCache` — so the Media tier adds no renderer work at
 * all. What was missing was everything in front of it: fetching,
 * decoding, not decoding the same thing twice, and releasing what is
 * no longer on screen.
 *
 * An implementation is free to fetch and decode wherever it likes; the
 * default one below does it wherever it is constructed, which for a
 * Gesso app is the render worker.
 */
export interface ImageResolver {
  /**
   * The decoded bitmap for a source, or a rejection.
   *
   * Calling twice with the same source must return the same bitmap
   * rather than decode twice, and two calls that overlap in time must
   * share one fetch.
   */
  resolve(source: string): Promise<UiImage>;
  /**
   * The bitmap for a source that is already decoded, held exactly as
   * `resolve` would hold it, or null when it is not decoded yet, in
   * which case nothing is held and the caller resolves as usual.
   *
   * Optional, because a resolver that decodes elsewhere may have no
   * synchronous answer. It exists for the frame that builds a node: a
   * promise settles a microtask after that frame has painted, so
   * without this a picture the cache already holds is drawn as its
   * placeholder for one frame, which under a shared-element morph is a
   * blank tile where the picture was a frame ago.
   */
  peek?(source: string): UiImage | null;
  /**
   * Says the caller no longer needs the source. The bitmap may be kept
   * (it is likely to be wanted again) but a resolver that closes
   * bitmaps must not close one another caller still holds.
   */
  release(source: string): void;
  /** Drops everything, for a runtime shutting down. */
  dispose(): void;
}

export interface DefaultImageResolverOptions {
  /**
   * How many decoded bitmaps to keep after their last holder released
   * them. The live ones — those something on screen is still holding —
   * are never evicted, whatever this says.
   */
  capacity?: number;
  /** Injectable for specs, and for an app that fetches through its own stack. */
  fetch?: (source: string) => Promise<Blob>;
  /** Injectable for specs; the platform's `createImageBitmap` by default. */
  decode?: (blob: Blob) => Promise<UiImage>;
}

interface Entry {
  readonly source: string;
  /** In flight, or settled. One per source, which is the de-duplication. */
  readonly bitmap: Promise<UiImage>;
  /** How many callers are holding it. Zero means it is evictable. */
  holders: number;
  /** Set once the promise settles, so eviction can close the bitmap. */
  settled: UiImage | null;
}

const DEFAULT_CAPACITY = 32;

/**
 * Fetch, decode, cache, evict.
 *
 * **Where the decode happens.** The decode belongs in a worker with
 * the bitmap transferred back. This resolver does not spawn one,
 * for two reasons that are worth stating rather than discovering
 * later. A Gesso runtime normally *is* a worker — the render worker of
 * `WorkerApp` — so a resolver constructed by it already fetches and
 * decodes off the main thread, and the bitmap never crosses a thread
 * at all, which is strictly better than transferring one. And
 * `createImageBitmap` is specified to decode in parallel, so even on a
 * main-thread runtime the decode is not on the main thread; only the
 * fetch bookkeeping is. A dedicated decode worker would therefore add
 * a nested worker to buy back something the platform already gives.
 * The seam is still open: `ImageStore.setResolver` takes any
 * `ImageResolver`, so an app that measures a reason for one can supply
 * it without touching a component.
 *
 * **What it cannot decode.** `createImageBitmap` takes a `Blob`, and
 * Chrome refuses an SVG one — "The source image could not be decoded".
 * So an `Image` pointed at an `.svg` fails on a browser where the same
 * file in an `<img>` would work, and a vector glyph belongs in `Icon`,
 * which draws a path rather than decoding a document. Found by
 * pointing the playground's Media card at an SVG data URL and getting
 * a placeholder.
 *
 * **Eviction.** Reference counting first, LRU second. A bitmap
 * something on screen is holding is never evicted, however long the
 * queue is; a released one stays cached until the capacity pushes it
 * out, so scrolling a list back and forth does not re-fetch. Evicting
 * closes the bitmap, because an `ImageBitmap` holds decoded pixels and
 * garbage collection is not prompt about them.
 */
export class DefaultImageResolver implements ImageResolver {
  private readonly entries = new Map<string, Entry>();
  /** Sources with no holders, least recently released first. */
  private readonly evictable: string[] = [];
  private readonly capacity: number;
  private readonly fetchBlob: (source: string) => Promise<Blob>;
  private readonly decodeBlob: (blob: Blob) => Promise<UiImage>;
  private disposed = false;

  constructor(options: DefaultImageResolverOptions = {}) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.fetchBlob = options.fetch ?? defaultFetch;
    this.decodeBlob = options.decode ?? defaultDecode;
  }

  /** Decoded or in-flight sources, for specs and the inspector. */
  get size(): number {
    return this.entries.size;
  }

  resolve(source: string): Promise<UiImage> {
    if (this.disposed) {
      return Promise.reject(new Error('The image resolver has been disposed.'));
    }
    const existing = this.entries.get(source);
    if (existing !== undefined) {
      existing.holders++;
      const index = this.evictable.indexOf(source);
      if (index !== -1) {
        this.evictable.splice(index, 1);
      }
      return existing.bitmap;
    }
    const entry: Entry = {
      source,
      holders: 1,
      settled: null,
      bitmap: this.fetchBlob(source)
        .then(blob => this.decodeBlob(blob))
        .then(bitmap => {
          // Released while it was in flight, and evicted since: the
          // entry is gone, so nothing will ever close this one.
          if (this.entries.get(source) !== entry) {
            bitmap.close?.();
            throw new Error(`The image '${source}' was released before it finished decoding.`);
          }
          entry.settled = bitmap;
          return bitmap;
        })
        .catch((error: unknown) => {
          // A failed fetch is not cached: the next caller should try
          // again rather than inherit a rejection forever.
          if (this.entries.get(source) === entry) {
            this.entries.delete(source);
            const index = this.evictable.indexOf(source);
            if (index !== -1) {
              this.evictable.splice(index, 1);
            }
          }
          throw error;
        })
    };
    // Nothing else awaits `entry.bitmap`, so a rejection with no
    // consumer would be an unhandled rejection in the worker.
    entry.bitmap.catch(() => {});
    this.entries.set(source, entry);
    return entry.bitmap;
  }

  peek(source: string): UiImage | null {
    if (this.disposed) {
      return null;
    }
    const existing = this.entries.get(source);
    if (existing === undefined || existing.settled === null) {
      return null;
    }
    // A hold, exactly as `resolve` takes one, so the caller's `release`
    // balances it and the bitmap stays live while it is on screen.
    existing.holders++;
    const index = this.evictable.indexOf(source);
    if (index !== -1) {
      this.evictable.splice(index, 1);
    }
    return existing.settled;
  }

  release(source: string): void {
    const entry = this.entries.get(source);
    if (entry === undefined || entry.holders === 0) {
      return;
    }
    entry.holders--;
    if (entry.holders > 0) {
      return;
    }
    this.evictable.push(source);
    while (this.evictable.length > this.capacity) {
      const oldest = this.evictable.shift()!;
      const stale = this.entries.get(oldest);
      if (stale === undefined || stale.holders > 0) {
        continue;
      }
      this.entries.delete(oldest);
      stale.settled?.close?.();
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.settled?.close?.();
    }
    this.entries.clear();
    this.evictable.length = 0;
  }
}

async function defaultFetch(source: string): Promise<Blob> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Fetching the image '${source}' failed with ${response.status} ${response.statusText}.`);
  }
  return response.blob();
}

function defaultDecode(blob: Blob): Promise<UiImage> {
  if (typeof createImageBitmap !== 'function') {
    return Promise.reject(new Error('createImageBitmap is unavailable, so images cannot be decoded here.'));
  }
  return createImageBitmap(blob);
}

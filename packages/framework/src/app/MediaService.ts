import {
  DefaultImageResolver,
  DefaultVideoResolver,
  type ImageResolver,
  type VideoResolver,
  IconRasterizer
} from '@gesso/core';

/**
 * What an application hands a runtime so its pictures come from
 * somewhere other than the defaults.
 *
 * All three are optional and independent: an app that fetches its
 * images through its own stack still gets the default rasteriser and
 * the default decoder. Whatever is left out, the runtime builds and
 * owns; whatever is passed belongs to the caller, and the runtime will
 * not dispose it. See `MediaService` for that rule in full.
 */
export interface MediaOptions {
  /** Where an `Image` finds its bitmap. */
  resolver?: ImageResolver;
  /** Where an `Icon` finds its raster. */
  rasterizer?: IconRasterizer;
  /** Where a `Video` finds its decoder. */
  videoResolver?: VideoResolver;
}

/**
 * Where an `Image` finds its bitmap, an `Icon` its raster and a
 * `Video` its decoder.
 *
 * A store for the same reason `ShellService` is one: a component reaches
 * the world outside the graph through an injected store and never
 * through a module-level singleton. It matters more here than usual,
 * because the cache has to be per runtime — two runtimes in one worker
 * (the playground has several) must not share a bitmap that one of
 * them is about to close.
 *
 * There are no actions on it: resolving is a promise a modifier awaits,
 * not a state transition, and modelling a decode as a dispatched action
 * would put every thumbnail of a scrolling list into the patch stream
 * for no consumer.
 */
export class MediaService {
  private imageResolver: ImageResolver = new DefaultImageResolver();
  private iconRasterizer = new IconRasterizer();
  private videoResolver: VideoResolver | null = null;
  /**
   * Whether each of the three is the service's to dispose.
   *
   * True for the ones built here, false once an application has
   * supplied its own: a caller that passes a resolver usually keeps a
   * reference to it and may well share it between runtimes, so
   * closing it when one of them shuts down would take the other's
   * bitmaps with it. The same rule for all three, because the
   * question is the same for all three.
   */
  private ownsResolver = true;
  private ownsRasterizer = true;
  private ownsVideoResolver = true;

  get images(): ImageResolver {
    return this.imageResolver;
  }

  get icons(): IconRasterizer {
    return this.iconRasterizer;
  }

  /**
   * Built on first use rather than in the field, because a decoder is
   * the one thing here that an app which never plays a video should
   * not be paying for — and because `canDecodeVideo()` is false on
   * plenty of threads that render perfectly well.
   */
  get videos(): VideoResolver {
    if (this.videoResolver === null) {
      this.videoResolver = new DefaultVideoResolver();
      this.ownsVideoResolver = true;
    }
    return this.videoResolver;
  }

  /**
   * Replaces the resolver — for a test double, for an app that fetches
   * through its own stack, or for one that has measured a reason to
   * decode in a worker of its own. See `ImageResolver`'s docblock for
   * why the default does not spawn one.
   */
  setResolver(resolver: ImageResolver): void {
    if (this.ownsResolver) {
      this.imageResolver.dispose();
    }
    this.imageResolver = resolver;
    this.ownsResolver = false;
  }

  /** The same seam, for video. */
  setVideoResolver(resolver: VideoResolver): void {
    if (this.ownsVideoResolver) {
      this.videoResolver?.dispose();
    }
    this.videoResolver = resolver;
    this.ownsVideoResolver = false;
  }

  /** The same seam, for icons. */
  setRasterizer(rasterizer: IconRasterizer): void {
    if (this.ownsRasterizer) {
      this.iconRasterizer.dispose();
    }
    this.iconRasterizer = rasterizer;
    this.ownsRasterizer = false;
  }

  /** Releases every decoded bitmap, for a runtime shutting down. */
  dispose(): void {
    if (this.ownsResolver) {
      this.imageResolver.dispose();
    }
    if (this.ownsVideoResolver) {
      this.videoResolver?.dispose();
    }
    if (this.ownsRasterizer) {
      this.iconRasterizer.dispose();
    }
  }
}

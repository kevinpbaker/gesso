import {
  DefaultImageResolver,
  DefaultVideoResolver,
  type ImageResolver,
  type VideoResolver,
  IconRasterizer
} from '@gesso/core';

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
  /** Set when the caller supplied one, so the default is not disposed twice. */
  private ownsResolver = true;
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

  setRasterizer(rasterizer: IconRasterizer): void {
    this.iconRasterizer.dispose();
    this.iconRasterizer = rasterizer;
  }

  /** Releases every decoded bitmap, for a runtime shutting down. */
  dispose(): void {
    if (this.ownsResolver) {
      this.imageResolver.dispose();
    }
    if (this.ownsVideoResolver) {
      this.videoResolver?.dispose();
    }
    this.iconRasterizer.dispose();
  }
}

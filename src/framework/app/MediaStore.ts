import { Store } from '../store/Store';
import { DefaultImageResolver, type ImageResolver } from '../../ui/rendering/ImageResolver';
import { IconRasterizer } from '../../ui/rendering/IconRasterizer';

/**
 * Where an `Image` finds its bitmap and an `Icon` its raster.
 *
 * A store for the same reason `ShellStore` is one: a component reaches
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
export class MediaStore extends Store {
  private imageResolver: ImageResolver = new DefaultImageResolver();
  private iconRasterizer = new IconRasterizer();
  /** Set when the caller supplied one, so the default is not disposed twice. */
  private ownsResolver = true;

  get images(): ImageResolver {
    return this.imageResolver;
  }

  get icons(): IconRasterizer {
    return this.iconRasterizer;
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

  setRasterizer(rasterizer: IconRasterizer): void {
    this.iconRasterizer.dispose();
    this.iconRasterizer = rasterizer;
  }

  /** Releases every decoded bitmap, for a runtime shutting down. */
  dispose(): void {
    if (this.ownsResolver) {
      this.imageResolver.dispose();
    }
    this.iconRasterizer.dispose();
  }
}

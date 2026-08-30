import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import type { UiColorValue } from '../properties/UiPropertyValues';
import { resolveColorValue } from '../properties/UiThemeColor';
import type { UiImage } from '../properties/UiImage';
import type { ImageResolver } from '../rendering/ImageResolver';
import type { IconRasterizer, IconSpec } from '../rendering/IconRasterizer';
import { defineModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

/**
 * The Media tier's two writers of the `image` property.
 *
 * Both are modifiers rather than subscriptions taken in a component
 * body, for the reason `decisions/0026` gives for `lazySource`: a
 * modifier's lifetime is exactly its node's. `host.own` releases the
 * decoded bitmap inside `removeSubtree`, so a list that scrolls a
 * thousand thumbnails past cannot leave a thousand of them held by an
 * application observable after their rows are gone — and an image is
 * the one thing in this framework where a leak is measured in
 * megabytes rather than in listeners.
 */

export interface ImageSourceArgs {
  readonly resolver: ImageResolver;
  readonly source: string;
  /** Told when the load finishes or fails, for a placeholder or an error slot. */
  readonly onState?: (state: 'loading' | 'loaded' | 'failed', error?: unknown) => void;
}

/**
 * Resolves a source and writes the bitmap onto the node's `image`.
 *
 * The write goes through the override cascade, so detaching restores
 * whatever the element declared — which for an `Image` is nothing, and
 * so the property is removed rather than set to a stale bitmap.
 */
export const imageSource = defineModifier<ImageSourceArgs>({
  name: 'imageSource',
  attach(host, args) {
    load(host, args);
  },
  update(host, args, previous) {
    if (args.resolver === previous.resolver && args.source === previous.source) {
      return;
    }
    previous.resolver.release(previous.source);
    load(host, args);
  },
  detach() {
    // The release is registered with `own`, so it runs here whether the
    // node was removed or the modifier merely left the list.
  }
});

function load(host: UiModifierHost, args: ImageSourceArgs): void {
  let live = true;
  args.onState?.('loading');
  host.clear('image');
  args.resolver
    .resolve(args.source)
    .then((bitmap: UiImage) => {
      if (!live) {
        return;
      }
      host.set('image', bitmap);
      args.onState?.('loaded');
    })
    .catch((error: unknown) => {
      if (!live) {
        return;
      }
      args.onState?.('failed', error);
    });
  host.own(() => {
    live = false;
    args.resolver.release(args.source);
  });
}

export interface IconSourceArgs {
  readonly rasterizer: IconRasterizer;
  readonly path: string;
  readonly viewBox: number;
  readonly size: number;
  /** A palette name or a literal; resolved against the theme the node inherits. */
  readonly color: UiColorValue;
  readonly style: 'fill' | 'stroke';
  readonly strokeWidth: number;
  /** How a filled path decides what is inside it; see `IconSpec.fillRule`. */
  readonly fillRule?: 'nonzero' | 'evenodd';
}

/**
 * Rasterises an icon path and writes it onto the node's `image`.
 *
 * The colour is the interesting part. Everything else in the library
 * names a palette entry and lets it resolve at paint, but a raster has
 * its colour baked in, so the icon has to be re-rasterised when the
 * theme under it changes. That is what `host.environment` and
 * `host.onEnvironment` — the half of `MODIFIERS_ROADMAP.md` B2 that
 * had no consumer until now — are for: the modifier reads the theme
 * the node inherits, and re-reads it when a provider above swaps it,
 * so an icon inside a card that turns dark turns with it.
 */
export const iconSource = defineModifier<IconSourceArgs>({
  name: 'iconSource',
  attach(host, args) {
    let current: IconSpec | null = null;
    let generation = 0;

    const render = (): void => {
      const theme = host.environment(UiEnvironmentKeys.theme);
      const color = resolveColorValue(host.node, args.color) ?? theme.colors.text;
      const spec: IconSpec = {
        path: args.path,
        viewBox: args.viewBox,
        size: args.size,
        color,
        style: args.style,
        strokeWidth: args.strokeWidth,
        fillRule: args.fillRule
      };
      if (current !== null && sameSpec(current, spec)) {
        return;
      }
      const previous = current;
      current = spec;
      const mine = ++generation;
      args.rasterizer
        .raster(spec)
        .then(bitmap => {
          if (generation === mine) {
            host.set('image', bitmap);
          }
        })
        .catch(() => {
          if (generation === mine) {
            host.clear('image');
          }
        });
      if (previous !== null) {
        args.rasterizer.release(previous);
      }
    };

    render();
    host.onEnvironment(render);
    host.own(() => {
      generation++;
      if (current !== null) {
        args.rasterizer.release(current);
        current = null;
      }
    });
  }
});

function sameSpec(a: IconSpec, b: IconSpec): boolean {
  return (
    a.path === b.path &&
    a.viewBox === b.viewBox &&
    a.size === b.size &&
    a.style === b.style &&
    a.strokeWidth === b.strokeWidth &&
    (a.fillRule ?? 'nonzero') === (b.fillRule ?? 'nonzero') &&
    a.color.r === b.color.r &&
    a.color.g === b.color.g &&
    a.color.b === b.color.b &&
    a.color.a === b.color.a
  );
}

import { combineLatest, distinctUntilChanged, isObservable, of, type Observable } from 'rxjs';

import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import type { Reactive } from '../composition/UiElementProps';
import type { UiColorValue } from '../properties/UiPropertyValues';
import { resolveColorValue } from '../properties/UiThemeColor';
import type { UiImage } from '../properties/UiImage';
import type { ImageResolver } from '../rendering/ImageResolver';
import type { IconRasterizer, IconSpec } from '../rendering/IconRasterizer';
import { defineModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

/**
 * A value or an Observable of one, as one Observable. The media
 * modifiers take their arguments this way so an `Image` whose `src` is
 * bound to a cell follows it, rather than reading it once at attach.
 */
function follow<T>(value: Reactive<T>): Observable<T> {
  return isObservable(value) ? (value as Observable<T>) : of(value);
}

export interface ImageSourceArgs {
  readonly resolver: ImageResolver;
  /** The url to resolve; an Observable is followed, and each new url replaces the last. */
  readonly source: Reactive<string>;
  readonly onState?: (state: 'loading' | 'loaded' | 'failed', error?: unknown) => void;
}

/**
 * Resolves a source to a bitmap and writes it onto the node's `image`.
 *
 * The source may be an Observable. Each distinct url it emits releases
 * the one before and starts a new load, so an `Image` bound to a cell
 * shows whatever the cell says rather than what it said when the node
 * was built. A load that has been superseded is dropped when it
 * arrives, never written.
 */
export const imageSource = defineModifier<ImageSourceArgs>({
  name: 'imageSource',
  attach(host, args) {
    let release: (() => void) | null = null;
    const subscription = follow(args.source)
      .pipe(distinctUntilChanged())
      .subscribe(source => {
        release?.();
        release = load(host, args, source);
      });
    host.own(() => {
      subscription.unsubscribe();
      release?.();
      release = null;
    });
  }
  // No `update`: a changed args object is a detach and an attach, which
  // is right, because the resolver or the whole source stream changed.
  // A changed *url* inside the stream is handled above.
});

/** Starts one load, and returns what undoes it: the in-flight result is dropped and the bitmap released. */
function load(host: UiModifierHost, args: ImageSourceArgs, source: string): () => void {
  let live = true;
  args.onState?.('loading');
  host.clear('image');
  args.resolver
    .resolve(source)
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
  return () => {
    live = false;
    args.resolver.release(source);
  };
}

export interface IconSourceArgs {
  readonly rasterizer: IconRasterizer;
  readonly path: Reactive<string>;
  readonly viewBox: Reactive<number>;
  readonly size: Reactive<number>;
  /** A palette name or a literal; resolved against the theme the node inherits. */
  readonly color: Reactive<UiColorValue>;
  readonly style: Reactive<'fill' | 'stroke'>;
  readonly strokeWidth: Reactive<number>;
  /** How a filled path decides what is inside it; see `IconSpec.fillRule`. */
  readonly fillRule?: Reactive<'nonzero' | 'evenodd' | undefined>;
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
    /** The arguments as last seen; each is followed, so a bound path or colour redraws the glyph. */
    let seen: {
      path: string;
      viewBox: number;
      size: number;
      color: UiColorValue;
      style: 'fill' | 'stroke';
      strokeWidth: number;
      fillRule: 'nonzero' | 'evenodd' | undefined;
    } | null = null;

    const render = (): void => {
      if (seen === null) {
        return;
      }
      const theme = host.environment(UiEnvironmentKeys.theme);
      const color = resolveColorValue(host.node, seen.color) ?? theme.colors.text;
      const spec: IconSpec = {
        path: seen.path,
        viewBox: seen.viewBox,
        size: seen.size,
        color,
        style: seen.style,
        strokeWidth: seen.strokeWidth,
        fillRule: seen.fillRule
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

    const subscription = combineLatest([
      follow(args.path),
      follow(args.viewBox),
      follow(args.size),
      follow(args.color),
      follow(args.style),
      follow(args.strokeWidth),
      follow(args.fillRule ?? undefined)
    ]).subscribe(([path, viewBox, size, color, style, strokeWidth, fillRule]) => {
      seen = { path, viewBox, size, color, style, strokeWidth, fillRule };
      render();
    });
    host.onEnvironment(render);
    host.own(() => {
      subscription.unsubscribe();
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

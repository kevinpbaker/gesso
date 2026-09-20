import type { UiColor } from '../properties/UiColor';
import type { UiImage } from '../properties/UiImage';
import { colorToCss } from './PaintState';

/** What an icon is: a path in a square viewBox, at a size, in a colour. */
export interface IconSpec {
  /** SVG path data, in the coordinates of `viewBox`. */
  readonly path: string;
  /** The side of the square the path is drawn in. 24 is the usual icon grid. */
  readonly viewBox: number;
  /** The side of the box the icon occupies, in logical pixels. */
  readonly size: number;
  readonly color: UiColor;
  /** `'fill'` for a solid glyph, `'stroke'` for a line one. */
  readonly style: 'fill' | 'stroke';
  /** Line width for a stroked icon, in viewBox units. */
  readonly strokeWidth: number;
  /**
   * Which points a filled path encloses: `'nonzero'` (the canvas
   * default) or `'evenodd'`.
   *
   * It matters for any glyph with a hole in it — a clock face, a
   * circle-and-slash, a downward arrow inside a cloud — because a
   * subpath wound the same way as its container does not punch a hole
   * under `nonzero` and does under `evenodd`. Icon sets author for one
   * or the other and say which in the SVG's `fill-rule`; Heroicons'
   * solid set says `evenodd`, and a Gesso `Icon` given that path
   * without this renders a filled blob.
   */
  readonly fillRule?: 'nonzero' | 'evenodd';
}

/**
 * Draws an icon path into a bitmap, once per distinct icon.
 *
 * The icon atlas comes later; the first cut rasterises per icon, replaced later without an API change.
 * This is that first cut, and the API it fixes is `IconSpec` in and a
 * `UiImage` out — which is what an atlas would also produce, with a
 * sub-rectangle of one texture instead of a bitmap of its own.
 *
 * **What this costs today, so the atlas has a number to beat:** one
 * `OffscreenCanvas` and one `createImageBitmap` per distinct
 * (path, size, colour, style) — so a toolbar of ten icons in one
 * colour is ten small textures where an atlas would be one, and the
 * same icon in a hover colour is a second entry. Nothing re-rasterises
 * while the spec is unchanged, and a theme change re-rasterises only
 * the icons on screen.
 */
export interface IconRasterizerOptions {
  /**
   * Physical pixels per logical pixel to rasterise at. Two is crisp on
   * an ordinary and on a retina display and is what the runtime passes
   * when it does not know better; an atlas will take the real one.
   */
  scale?: number;
  /** How many released rasters to keep. */
  capacity?: number;
  /** Injectable for specs and for a host without `OffscreenCanvas`. */
  createCanvas?: (width: number, height: number) => IconCanvas;
}

/** The little that rasterising a path needs, so a spec can stand in for it. */
export interface IconCanvas {
  getContext2D(): IconContext | null;
  toBitmap(): Promise<UiImage>;
}

export interface IconContext {
  scale(x: number, y: number): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  fill(path: Path2D, fillRule?: 'nonzero' | 'evenodd'): void;
  stroke(path: Path2D): void;
}

interface Raster {
  readonly key: string;
  readonly bitmap: Promise<UiImage>;
  holders: number;
  settled: UiImage | null;
}

const DEFAULT_SCALE = 2;
const DEFAULT_CAPACITY = 64;

export function iconKey(spec: IconSpec): string {
  const { r, g, b, a } = spec.color;
  return `${spec.size}|${spec.viewBox}|${spec.style}|${spec.strokeWidth}|${spec.fillRule ?? 'nonzero'}|${r},${g},${b},${a}|${spec.path}`;
}

export class IconRasterizer {
  private readonly rasters = new Map<string, Raster>();
  private readonly evictable: string[] = [];
  private readonly scale: number;
  private readonly capacity: number;
  private readonly createCanvas: (width: number, height: number) => IconCanvas;

  constructor(options: IconRasterizerOptions = {}) {
    this.scale = options.scale ?? DEFAULT_SCALE;
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.createCanvas = options.createCanvas ?? offscreenCanvas;
  }

  get size(): number {
    return this.rasters.size;
  }

  raster(spec: IconSpec): Promise<UiImage> {
    const key = iconKey(spec);
    const existing = this.rasters.get(key);
    if (existing !== undefined) {
      existing.holders++;
      const index = this.evictable.indexOf(key);
      if (index !== -1) {
        this.evictable.splice(index, 1);
      }
      return existing.bitmap;
    }
    const raster: Raster = {
      key,
      holders: 1,
      settled: null,
      bitmap: this.draw(spec).then(bitmap => {
        if (this.rasters.get(key) !== raster) {
          bitmap.close?.();
          throw new Error('The icon was released before it finished rasterising.');
        }
        raster.settled = bitmap;
        return bitmap;
      })
    };
    raster.bitmap.catch(() => {});
    this.rasters.set(key, raster);
    return raster.bitmap;
  }

  release(spec: IconSpec): void {
    const key = iconKey(spec);
    const raster = this.rasters.get(key);
    if (raster === undefined || raster.holders === 0) {
      return;
    }
    raster.holders--;
    if (raster.holders > 0) {
      return;
    }
    this.evictable.push(key);
    while (this.evictable.length > this.capacity) {
      const oldest = this.evictable.shift()!;
      const stale = this.rasters.get(oldest);
      if (stale === undefined || stale.holders > 0) {
        continue;
      }
      this.rasters.delete(oldest);
      stale.settled?.close?.();
    }
  }

  dispose(): void {
    for (const raster of this.rasters.values()) {
      raster.settled?.close?.();
    }
    this.rasters.clear();
    this.evictable.length = 0;
  }

  private async draw(spec: IconSpec): Promise<UiImage> {
    const side = Math.max(1, Math.round(spec.size * this.scale));
    const canvas = this.createCanvas(side, side);
    const ctx = canvas.getContext2D();
    if (ctx === null) {
      throw new Error('An icon could not be rasterised: no 2D context.');
    }
    // The path is authored in viewBox units; one transform puts it in
    // the physical pixels of the bitmap, so nothing else has to scale.
    const unit = side / spec.viewBox;
    ctx.scale(unit, unit);
    const path = new Path2D(spec.path);
    if (spec.style === 'stroke') {
      ctx.strokeStyle = colorToCss(spec.color);
      ctx.lineWidth = spec.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    } else {
      ctx.fillStyle = colorToCss(spec.color);
      ctx.fill(path, spec.fillRule ?? 'nonzero');
    }
    return canvas.toBitmap();
  }
}

/**
 * `OffscreenCanvas` is available on the main thread and in a worker,
 * which is what lets an icon be rasterised wherever the runtime lives —
 * the same property that lets `UiImage` be an `ImageBitmap`.
 */
function offscreenCanvas(width: number, height: number): IconCanvas {
  if (typeof OffscreenCanvas !== 'function') {
    throw new Error('OffscreenCanvas is unavailable, so icons cannot be rasterised here.');
  }
  const canvas = new OffscreenCanvas(width, height);
  return {
    getContext2D: () => canvas.getContext('2d') as unknown as IconContext | null,
    toBitmap: () => createImageBitmap(canvas)
  };
}

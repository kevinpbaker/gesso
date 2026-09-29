import { DirtyFlags } from '../../graph/DirtyFlags';
import type { UiNode } from '../../graph/UiNode';
import type { LayoutRecord } from '../../layout/LayoutRecord';
import type { RenderChanges } from '../RenderContext';
import type { Canvas2DContext } from './Canvas2DContext';
import type { CanvasHost } from './CanvasSurface';

/**
 * Scroll layers: a scroll container's content kept as pixels, so that
 * a frame which only scrolled it copies what it already drew and
 * paints the strip that came into view, instead of drawing everything
 * again.
 *
 * **Why.** Canvas2D clears the surface and draws every visible node on
 * every frame. With a GPU that is cheap. Without one — a headless
 * browser, a locked-down machine, a driver on the blocklist — the
 * browser rasterises each frame's draw calls on the CPU when the frame
 * is committed, and a screen covered by a few layers of pictures costs
 * that raster a whole frame's budget before any JavaScript has run.
 * gessologic's canvas, panned with nothing else moving, measured 17.5
 * ms between frames on exactly that path, all of it the recomposite of
 * pixels that had only moved. A layer turns such a frame into two
 * copies of the viewport and the raster of a strip: a screen of
 * three-picture tiles at a fractional offset, scrolled a few pixels a
 * frame in software Chrome with the raster forced into the frame so it
 * could be timed, went from 8.6 ms a frame to 2.4.
 *
 * **What a layer holds.** Exactly what `renderNode` draws between a
 * scroll container's scroll translation and its restore: the children,
 * clipped to the viewport, with nothing under them. The container's
 * own background and border, its scrollbars, its text, everything
 * drawn after it and every overlay are drawn onto the frame as before,
 * every frame. So the only claim a layer makes is about the container's
 * subtree, and the only thing it has to be told is whether that
 * subtree changed.
 *
 * **When one is trusted.** Only when the caller vouches for what
 * changed (`RenderContext.changes`), and only while all of these hold:
 *
 *   - no box moved anywhere (`geometryVersion` is unchanged), and the
 *     frame dirtied nothing but paint, scroll and semantics;
 *   - nothing in the container's subtree, and none of its ancestors,
 *     was dirtied, except the container's own scroll offset — an
 *     ancestor because inherited paint (a text colour, a font) reaches
 *     the subtree without dirtying it, and because the runtime marks
 *     the root to ask for a repaint and says nothing about what for;
 *   - the container lands on the same device-pixel phase, at the same
 *     device scale, with no rotation, skew or scale above it and no
 *     opacity in force, so a copy is exact rather than resampled;
 *   - the scroll moved it by a whole number of device pixels;
 *   - nothing the layer drew depends on the clock (a caret, a fading
 *     scrollbar, a video frame) or escaped it (a lifted node).
 *
 * Anything else, and the container is drawn directly, exactly as it
 * was before layers existed. The first frame a container scrolls on
 * pays for the layer — its content drawn into it, then the copy onto
 * the frame — and every scroll-only frame after that is repaid.
 *
 * **What it cannot help.** A frame where the content itself changes —
 * a live layer redrawn every tick, a zoom that resizes every tile — is
 * drawn as before: there is nothing retained that is still right.
 * Nor an app that pans by moving each child's position rather than by
 * scrolling: that is a layout change, and it moves boxes.
 */

/** Makes a layer canvas, or null where none can be had. Injectable for specs. */
export type LayerCanvasFactory = (width: number, height: number) => CanvasHost | null;

/**
 * An `OffscreenCanvas` where there is one. Where there is not, no
 * layer is made and every frame is drawn directly, which is the
 * behaviour a host without one had anyway.
 */
export function offscreenLayerCanvas(width: number, height: number): CanvasHost | null {
  if (typeof OffscreenCanvas !== 'function') {
    return null;
  }
  return new OffscreenCanvas(width, height) as unknown as CanvasHost;
}

/**
 * How far from a whole device pixel a translation may be and still be
 * treated as whole. Floating point makes a scroll of ten pixels come
 * out as 9.999999999998 often enough that exact equality would refuse
 * nearly every pan; a thousandth of a pixel is invisible, and the
 * layer's offset is kept pixel-true (see `shift`) so the error never
 * accumulates past it.
 */
const EPSILON = 1e-3;

/**
 * The most layers held at once. Each costs two canvases the size of its
 * viewport; a screen with more scroll containers scrolling at once than
 * this is not one a layer per container would help.
 */
const MAX_LAYERS = 4;

/** Dirt that says only what was painted, scrolled or meant — nothing moved. */
const RETAINABLE = DirtyFlags.Paint | DirtyFlags.Properties | DirtyFlags.Transform | DirtyFlags.Semantics;

/** Where a container's viewport lands in device pixels this frame. */
export interface LayerPlacement {
  /** The whole-pixel rectangle the layer covers on the surface. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * The translation content is drawn into the layer with, so that it
   * lands at the same fraction of a pixel it would have on the frame.
   */
  offsetX: number;
  offsetY: number;
}

/** A rectangle of layer pixels. */
export interface LayerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScrollLayer {
  /** Holds the content as of `scrollX`/`scrollY`. */
  front: CanvasHost;
  frontContext: Canvas2DContext;
  /** The canvas a shift copies into, then swapped to the front. */
  back: CanvasHost;
  backContext: Canvas2DContext;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
  /**
   * The scroll offset the pixels are exactly right for. Advanced by
   * whole device pixels only, so it can differ from the record's by at
   * most `EPSILON` and the difference never grows.
   */
  scrollX: number;
  scrollY: number;
  used: boolean;
}

/** What the layers did, for `ScrollLayers.budget.spec.ts`. */
export interface ScrollLayerStats {
  /** Layers made and filled from a full walk of the container's children. */
  built: number;
  /** Frames a layer was copied onto the surface. */
  composited: number;
  /** Frames a layer was moved by a scroll and had its exposed strips painted. */
  shifted: number;
  /** Layers dropped because something they held changed or could not be trusted. */
  dropped: number;
}

export class ScrollLayerCache {
  private readonly layers = new Map<UiNode, ScrollLayer>();
  /**
   * Containers whose last layer drew something that changes without
   * telling anyone — a caret, a fading scrollbar, a video. Building
   * another on the next scroll would only throw it away again, so none
   * is built until something in or above the subtree is dirtied, which
   * is how every one of those ends.
   */
  private readonly refused = new Set<UiNode>();
  private geometryVersion = Number.NaN;
  private dpr = 0;
  private surfaceWidth = 0;
  private surfaceHeight = 0;
  private frame: RenderChanges['frame'] | null = null;
  /**
   * Between `beginFrame` and `endFrame`. Still true at the next
   * `beginFrame` means the last frame threw part way through, perhaps
   * inside a layer's walk, and whatever the layers hold is suspect.
   */
  private open = false;
  readonly stats: ScrollLayerStats = { built: 0, composited: 0, shifted: 0, dropped: 0 };

  constructor(private readonly createCanvas: LayerCanvasFactory) {}

  /** Whether layers may be used on this frame; false until `beginFrame` says so. */
  get active(): boolean {
    return this.frame !== null;
  }

  resetStats(): void {
    this.stats.built = 0;
    this.stats.composited = 0;
    this.stats.shifted = 0;
    this.stats.dropped = 0;
  }

  /**
   * Settles which layers this frame's changes leave standing, before
   * anything is drawn. Every rule here drops; none keeps. A frame the
   * caller could not vouch for drops them all.
   */
  beginFrame(changes: RenderChanges | undefined, dpr: number, surfaceWidth: number, surfaceHeight: number): void {
    const interrupted = this.open;
    this.open = true;
    if (
      interrupted ||
      changes === undefined ||
      dpr !== this.dpr ||
      surfaceWidth !== this.surfaceWidth ||
      surfaceHeight !== this.surfaceHeight ||
      changes.geometryVersion !== this.geometryVersion
    ) {
      this.dropAll();
      this.dpr = dpr;
      this.surfaceWidth = surfaceWidth;
      this.surfaceHeight = surfaceHeight;
      this.geometryVersion = changes?.geometryVersion ?? Number.NaN;
      this.frame = changes?.frame ?? null;
      return;
    }
    const frame = changes.frame;
    this.frame = frame;
    if (this.layers.size === 0 && this.refused.size === 0) {
      return;
    }
    for (const [node, flags] of frame.entries()) {
      if ((flags & ~RETAINABLE) !== 0) {
        // Layout, children, content or environment: something may have
        // moved or restyled without a box saying so. The version would
        // usually have caught it; this does not depend on "usually".
        this.dropAll();
        return;
      }
      // A container's own scroll is the one change its layer absorbs.
      // Its ancestors' layers are another matter: they hold its pixels.
      const scrolledOnly = flags === DirtyFlags.Transform;
      for (let current = scrolledOnly ? node.parent : node; current !== null; current = current.parent) {
        this.forget(current);
      }
    }
    // Inherited paint reaches a subtree without dirtying it, so a dirty
    // ancestor is a dirty subtree. An ancestor that only scrolled moves
    // the layer on the surface, which the placement check hears about.
    for (const node of [...this.layers.keys(), ...this.refused]) {
      for (let ancestor = node.parent; ancestor !== null; ancestor = ancestor.parent) {
        const flags = frame.dirtyFlagsFor(ancestor);
        if (flags !== DirtyFlags.None && flags !== DirtyFlags.Transform) {
          this.forget(node);
          break;
        }
      }
    }
  }

  /** Drops the layers the frame did not composite: their container was culled, removed, or drawn directly. */
  endFrame(): void {
    this.open = false;
    for (const [node, layer] of this.layers) {
      if (!layer.used) {
        this.drop(node);
      } else {
        layer.used = false;
      }
    }
  }

  get(node: UiNode): ScrollLayer | undefined {
    return this.layers.get(node);
  }

  /**
   * Whether a container with no layer should get one now: it scrolled
   * on this frame, which is the evidence it will scroll on the next,
   * and it has not just shown it holds something a layer cannot.
   */
  wants(node: UiNode): boolean {
    const frame = this.frame;
    return (
      frame !== null &&
      this.layers.size < MAX_LAYERS &&
      !this.refused.has(node) &&
      (frame.dirtyFlagsFor(node) & DirtyFlags.Transform) !== 0
    );
  }

  /** A new layer for the placement, or null where no canvas could be had. */
  create(node: UiNode, placement: LayerPlacement, rec: LayoutRecord): ScrollLayer | null {
    const front = this.createCanvas(placement.width, placement.height);
    const back = front === null ? null : this.createCanvas(placement.width, placement.height);
    const frontContext = front?.getContext('2d') as Canvas2DContext | null | undefined;
    const backContext = back?.getContext('2d') as Canvas2DContext | null | undefined;
    if (front === null || back === null || !frontContext || !backContext) {
      return null;
    }
    const layer: ScrollLayer = {
      front,
      frontContext,
      back,
      backContext,
      width: placement.width,
      height: placement.height,
      offsetX: placement.offsetX,
      offsetY: placement.offsetY,
      dpr: this.dpr,
      scrollX: rec.scrollX,
      scrollY: rec.scrollY,
      used: true
    };
    this.layers.set(node, layer);
    this.stats.built++;
    return layer;
  }

  /**
   * Whether a layer's pixels would land where this frame's direct draw
   * would put them: the same size, the same fraction of a pixel.
   */
  fits(layer: ScrollLayer, placement: LayerPlacement): boolean {
    return (
      !contextLost(layer.frontContext) &&
      !contextLost(layer.backContext) &&
      layer.width === placement.width &&
      layer.height === placement.height &&
      layer.dpr === this.dpr &&
      Math.abs(layer.offsetX - placement.offsetX) < EPSILON &&
      Math.abs(layer.offsetY - placement.offsetY) < EPSILON
    );
  }

  /**
   * Moves the layer's pixels to follow the record's scroll offset, and
   * returns the strips that came into view and need painting — none
   * when it did not scroll, the whole layer when it scrolled further
   * than it is wide. Null when the scroll was not a whole number of
   * device pixels, which a copy cannot follow without resampling.
   */
  shift(layer: ScrollLayer, rec: LayoutRecord): LayerRect[] | null {
    const exactX = (layer.scrollX - rec.scrollX) * layer.dpr;
    const exactY = (layer.scrollY - rec.scrollY) * layer.dpr;
    const dx = Math.round(exactX);
    const dy = Math.round(exactY);
    if (Math.abs(exactX - dx) > EPSILON || Math.abs(exactY - dy) > EPSILON) {
      return null;
    }
    if (dx === 0 && dy === 0) {
      return [];
    }
    // Pixel-true rather than the record's: the pixels moved by exactly
    // dx, so they now show the offset dx away from where they were, and
    // the strips must be painted at that offset to meet them seamlessly.
    layer.scrollX -= dx / layer.dpr;
    layer.scrollY -= dy / layer.dpr;
    const { width, height } = layer;
    if (Math.abs(dx) >= width || Math.abs(dy) >= height) {
      clearLayer(layer.frontContext, width, height);
      return [{ x: 0, y: 0, width, height }];
    }
    // Into the back canvas and swapped, rather than drawn onto itself:
    // a canvas drawn onto itself is snapshotted first by every engine,
    // which is the same copy with less said about it.
    const back = layer.backContext;
    clearLayer(back, width, height);
    back.drawImage(layer.front as unknown as OffscreenCanvas, dx, dy, width, height);
    [layer.front, layer.back] = [layer.back, layer.front];
    [layer.frontContext, layer.backContext] = [layer.backContext, layer.frontContext];
    this.stats.shifted++;
    const strips: LayerRect[] = [];
    if (dx !== 0) {
      strips.push({ x: dx > 0 ? 0 : width + dx, y: 0, width: Math.abs(dx), height });
    }
    if (dy !== 0) {
      // Beside the column strip rather than across it, so no pixel is
      // painted twice.
      strips.push({
        x: dx > 0 ? dx : 0,
        y: dy > 0 ? 0 : height + dy,
        width: width - Math.abs(dx),
        height: Math.abs(dy)
      });
    }
    return strips;
  }

  /** Stops building layers for a container until its subtree is next dirtied. */
  refuse(node: UiNode): void {
    this.drop(node);
    this.refused.add(node);
  }

  drop(node: UiNode): void {
    const layer = this.layers.get(node);
    if (layer === undefined) {
      return;
    }
    this.layers.delete(node);
    this.stats.dropped++;
    // A zero-sized canvas gives its backing store back now, rather than
    // whenever the collector gets round to two canvases the size of a
    // screen.
    layer.front.width = 0;
    layer.back.width = 0;
  }

  dropAll(): void {
    // Deleting the entry being visited is safe for a Map iterator.
    for (const node of this.layers.keys()) {
      this.drop(node);
    }
    this.refused.clear();
  }

  private forget(node: UiNode): void {
    this.drop(node);
    this.refused.delete(node);
  }
}

/**
 * Where a scroll container's viewport lands in device pixels, or null
 * when a layer could not reproduce the direct draw exactly: no
 * transform to read, a rotation, skew or scale above the container, an
 * opacity in force, or a viewport too large to be worth two copies.
 *
 * The layer covers the whole pixels the viewport touches. Its content
 * is drawn with the same fractional translation the frame has, so a
 * node lands in the layer at the same fraction of a pixel it would
 * have on the frame, and the layer is then copied onto whole pixels
 * with no resampling at all.
 */
export function placeLayer(
  ctx: Canvas2DContext,
  rec: LayoutRecord,
  dpr: number,
  surfaceWidth: number,
  surfaceHeight: number
): LayerPlacement | null {
  const m = ctx.getTransform?.();
  if (m === undefined || ctx.globalAlpha !== 1) {
    return null;
  }
  if (Math.abs(m.b) > EPSILON || Math.abs(m.c) > EPSILON || m.a !== dpr || m.d !== dpr) {
    return null;
  }
  const left = dpr * rec.x + m.e;
  const top = dpr * rec.y + m.f;
  const x = Math.floor(left + EPSILON);
  const y = Math.floor(top + EPSILON);
  const width = Math.ceil(left + dpr * rec.width - EPSILON) - x;
  const height = Math.ceil(top + dpr * rec.height - EPSILON) - y;
  // No larger than the surface: a viewport taller than the screen is
  // scrolled by an outer container more than by itself, and a layer
  // for it would be mostly pixels nobody sees.
  if (width <= 0 || height <= 0 || width * height > surfaceWidth * surfaceHeight) {
    return null;
  }
  return { x, y, width, height, offsetX: m.e - x, offsetY: m.f - y };
}

/**
 * Whether the browser threw a layer's backing store away — a GPU reset
 * takes 2D canvases with it — which would leave a layer that composites
 * as nothing. Optional on the context, as on older engines.
 */
function contextLost(ctx: Canvas2DContext): boolean {
  return (ctx as { isContextLost?: () => boolean }).isContextLost?.() === true;
}

function clearLayer(ctx: Canvas2DContext, width: number, height: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
}

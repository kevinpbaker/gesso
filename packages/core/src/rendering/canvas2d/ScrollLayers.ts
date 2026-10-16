import { DirtyFlags } from '../../graph/DirtyFlags';
import type { UiNode } from '../../graph/UiNode';
import { UiNodeType } from '../../graph/UiNodeType';
import type { LayoutRecord } from '../../layout/LayoutRecord';
import type { LayoutReader, RenderChanges } from '../RenderContext';
import { snapScroll } from '../ScrollSnap';
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
 * changed (\`RenderContext.changes\`), and only while all of these hold:
 *
 *   - no ancestor's properties or environment changed: an inherited
 *     value set above marks the descendants that read it, which is
 *     damage like any other, and this keeps the old caution for the
 *     rest. An ancestor marked for paint alone is the runtime asking
 *     for a frame; one laid out again either leaves the container where
 *     it was or moves it, which the next rule hears about;
 *   - the container lands on the same device-pixel phase, at the same
 *     device scale, with no rotation, skew or scale above it and no
 *     opacity in force, so a copy is exact rather than resampled;
 *   - nothing the layer drew depends on the clock (a caret, a fading
 *     scrollbar, a video frame) or escaped it (a lifted node).
 *
 * **What a frame redraws in it.** The strip a scroll brought into view
 * (the scroll as the frame draws it, snapped to a device pixel), and the
 * items something changed (see \`damage\`): an item, one of the
 * container's children through any fragments, is wrong where it was and
 * where it is when it is added, removed, moved, or changed inside. A
 * lazy list scrolling mounts and unmounts rows in its overscan and grows
 * and shrinks spacers off screen, so what it redraws is the strip. Only
 * what reaches the strips is walked, a \`SPILL\` past them.
 *
 * Anything else, and the container is drawn directly, exactly as it
 * was before layers existed. The first frame a container scrolls on
 * pays for the layer — its content drawn into it, then the copy onto
 * the frame — and every frame after that is repaid.
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

/**
 * How many frames in a row a container must scroll, with nothing else
 * in or above it changing, before it gets a layer.
 *
 * One — a layer on the first scroll — was the first value, and it made
 * a spreadsheet three times slower to scroll in software rendering. A
 * virtualised list mounts and unmounts rows as it scrolls, so almost no
 * frame of its scroll is scroll-only: each one built a layer (two
 * viewport-sized canvases, the content drawn into one, the copy onto the
 * frame) and the next frame's new rows dropped it. gessosheet measured
 * 2.8 ms a frame without layers and 9 ms with. The allocations were
 * worse than slow: a canvas's pixels can wait on the page's main thread
 * in software compositing, so a blocked page stalled the render worker
 * outright. A container whose scroll has been scroll-only for a few
 * frames running is one a layer will be kept for.
 */
export const SCROLL_LAYER_SETTLE_FRAMES = 3;

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
  /**
   * Where each of the container's items (its children, through any
   * fragments) was when the layer was last drawn, in the children's
   * coordinates: what an item added, removed or moved is judged by.
   */
  items: Map<UiNode, ItemBox>;
  /**
   * Where each sticky node inside the container was drawn when the
   * layer was last drawn: its box moved by its own sticky shift and its
   * sticky ancestors'. A scroll moves a sticky node without moving its
   * box or dirtying it, so \`items\` cannot see it; the copy carries its
   * pixels off with the content and leaves them there.
   */
  stuck: Map<UiNode, ItemBox>;
}

/** An item's box in the container's children's coordinates. */
interface ItemBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
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
  private dpr = 0;
  private surfaceWidth = 0;
  private surfaceHeight = 0;
  private frame: RenderChanges['frame'] | null = null;
  /** Consecutive frames each container without a layer has scrolled quietly. See `SCROLL_LAYER_SETTLE_FRAMES`. */
  private readonly streaks = new WeakMap<UiNode, number>();
  /**
   * Between `beginFrame` and `endFrame`. Still true at the next
   * `beginFrame` means the last frame threw part way through, perhaps
   * inside a layer's walk, and whatever the layers hold is suspect.
   */
  private open = false;
  readonly stats: ScrollLayerStats = { built: 0, composited: 0, shifted: 0, dropped: 0 };

  constructor(
    private readonly createCanvas: LayerCanvasFactory,
    private readonly settleFrames: number = SCROLL_LAYER_SETTLE_FRAMES
  ) {}

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
   * caller could not vouch for drops them all. What changed inside a
   * container is not settled here but drawn over: see \`damage\`.
   */
  beginFrame(changes: RenderChanges | undefined, dpr: number, surfaceWidth: number, surfaceHeight: number): void {
    const interrupted = this.open;
    this.open = true;
    if (
      interrupted ||
      changes === undefined ||
      dpr !== this.dpr ||
      surfaceWidth !== this.surfaceWidth ||
      surfaceHeight !== this.surfaceHeight
    ) {
      this.dropAll();
      this.dpr = dpr;
      this.surfaceWidth = surfaceWidth;
      this.surfaceHeight = surfaceHeight;
      this.frame = changes?.frame ?? null;
      return;
    }
    const frame = changes.frame;
    this.frame = frame;
    // What changed inside a container is the layer's to absorb, item by
    // item (see \`damage\`); a box moving anywhere else moves the layer on
    // the surface, which \`fits\` hears about. What an ancestor changed is
    // another matter: inherited paint reaches the subtree without
    // dirtying it, so a dirty ancestor is a dirty subtree. An ancestor
    // that only scrolled moves the layer, which \`fits\` hears about too.
    for (const node of this.layers.keys()) {
      if (dirtyAbove(frame, node)) {
        this.forget(node);
      }
    }
    // A refused container is tried again once anything in or above it
    // changes, which is how a caret or a fading scrollbar inside it ends:
    // the blink or the fade timer marks the root.
    for (const [node, flags] of frame.entries()) {
      // Its own scroll, or an ancestor's, changes nothing it holds.
      if (flags === DirtyFlags.Transform) {
        continue;
      }
      for (const refused of this.refused) {
        if (node === refused || contains(node, refused) || contains(refused, node)) {
          this.refused.delete(refused);
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
   * Whether a container with no layer should get one now: it has
   * scrolled on the last few frames running with nothing above it
   * changing, which is the evidence a layer would be kept, and it has
   * not just shown it holds something a layer cannot. What changes
   * inside it is absorbed item by item (see \`damage\`), so a lazy list
   * mounting rows as it scrolls keeps its layer.
   */
  wants(node: UiNode): boolean {
    const frame = this.frame;
    if (frame === null || this.layers.size >= MAX_LAYERS || this.refused.has(node)) {
      return false;
    }
    if (dirtyAbove(frame, node)) {
      this.streaks.delete(node);
      return false;
    }
    if ((frame.dirtyFlagsFor(node) & DirtyFlags.Transform) === 0) {
      return false;
    }
    const streak = (this.streaks.get(node) ?? 0) + 1;
    if (streak < this.settleFrames) {
      this.streaks.set(node, streak);
      return false;
    }
    this.streaks.delete(node);
    return true;
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
      scrollX: snapScroll(rec.scrollX, this.dpr),
      scrollY: snapScroll(rec.scrollY, this.dpr),
      used: true,
      items: new Map(),
      stuck: new Map()
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
    // The offset as the frame draws it, on a whole device pixel (see
    // \`snapScroll\`): a trackpad's paced offset is almost never one, and
    // the direct draw it stands in for is snapped too.
    const exactX = (layer.scrollX - snapScroll(rec.scrollX, layer.dpr)) * layer.dpr;
    const exactY = (layer.scrollY - snapScroll(rec.scrollY, layer.dpr)) * layer.dpr;
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

  /**
   * The parts of a layer this frame's changes inside the container left
   * wrong, in the layer's pixels, or \`'all'\` when that is most of it.
   * Called after \`shift\`, so the layer's offset is the frame's.
   *
   * Judged item by item, an item being one of the container's children
   * (through any fragments): a lazy list's row, say. An item added,
   * removed or moved is wrong where it was and where it is; an item with
   * anything changed inside it is wrong where it is. Whatever none of
   * that touches is right already, which in a lazy list scrolling is
   * everything on screen: the rows it mounts and unmounts are in its
   * overscan, and the spacers that stand for the rest only grow and
   * shrink off the top and bottom.
   */
  damage(layer: ScrollLayer, container: UiNode, layout: LayoutReader): LayerRect[] | 'all' {
    const frame = this.frame;
    if (frame === null) {
      return 'all';
    }
    const boxes: ItemBox[] = [];
    // Changed inside an item: wrong where the item was and is.
    for (const [node, flags] of frame.entries()) {
      if (node === container) {
        // Its own paint is drawn outside the layer, its children are
        // compared below and its size is \`fits\`'s; but inherited style
        // reaches every item without dirtying one.
        if ((flags & DirtyFlags.Environment) !== 0) {
          return 'all';
        }
        continue;
      }
      const item = itemHolding(container, node);
      if (item === null) {
        continue;
      }
      const was = layer.items.get(item);
      const now = boxOf(layout, item);
      if (was !== undefined) {
        boxes.push(was);
      }
      if (now !== undefined && (was === undefined || !sameBox(was, now))) {
        boxes.push(now);
      }
    }
    // Added, removed or moved: wrong where it was and where it is.
    const seen = new Set<UiNode>();
    for (const item of itemsOf(container)) {
      seen.add(item);
      const now = boxOf(layout, item);
      const was = layer.items.get(item);
      if (now === undefined) {
        continue;
      }
      if (was === undefined) {
        boxes.push(now);
      } else if (!sameBox(was, now)) {
        boxes.push(was, now);
      }
    }
    for (const [item, was] of layer.items) {
      if (!seen.has(item)) {
        boxes.push(was);
      }
    }
    // Stuck or let go, or scrolled while stuck: wrong where it was drawn
    // and where it is drawn now.
    const stuck = stuckIn(container, layout);
    if (stuck === null) {
      return 'all';
    }
    for (const [node, now] of stuck) {
      const was = layer.stuck.get(node);
      if (was === undefined) {
        boxes.push(now);
      } else if (!sameBox(was, now)) {
        boxes.push(was, now);
      }
    }
    for (const [node, was] of layer.stuck) {
      if (!stuck.has(node)) {
        boxes.push(was);
      }
    }
    const rects: LayerRect[] = [];
    let area = 0;
    for (const box of boxes) {
      const rect = this.toLayer(layer, box);
      // An item changed inside and moved is named twice; drawn once.
      if (rect !== null && !rects.some(other => sameBox(other, rect))) {
        rects.push(rect);
        area += rect.width * rect.height;
      }
    }
    return area > layer.width * layer.height * MOSTLY ? 'all' : rects;
  }

  /** Notes where the container's items are, for the next frame's \`damage\`. */
  remember(layer: ScrollLayer, container: UiNode, layout: LayoutReader): void {
    layer.items.clear();
    for (const item of itemsOf(container)) {
      const box = boxOf(layout, item);
      if (box !== undefined) {
        layer.items.set(item, box);
      }
    }
    layer.stuck = stuckIn(container, layout) ?? new Map();
  }

  /** An item's box in the layer's pixels, widened for what paints past it, or null off the layer. */
  private toLayer(layer: ScrollLayer, box: ItemBox): LayerRect | null {
    const dpr = layer.dpr;
    const left = Math.max(0, Math.floor(layer.offsetX + dpr * (box.x - layer.scrollX - SPILL)));
    const top = Math.max(0, Math.floor(layer.offsetY + dpr * (box.y - layer.scrollY - SPILL)));
    const right = Math.min(layer.width, Math.ceil(layer.offsetX + dpr * (box.x + box.width - layer.scrollX + SPILL)));
    const bottom = Math.min(
      layer.height,
      Math.ceil(layer.offsetY + dpr * (box.y + box.height - layer.scrollY + SPILL))
    );
    return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
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
 * Whether an ancestor's properties or environment changed. An inherited
 * value set on an ancestor marks every descendant that reads it as well
 * (the graph re-provides it), so what it changes inside the container
 * is damage like any other; this keeps the old caution for the rest.
 * An ancestor marked for paint alone is the runtime asking for a frame
 * (a scrollbar fading, an inspector outline), which nothing inside the
 * container hears; one laid out again either leaves the container where
 * it was or moves it, which \`fits\` hears about; one whose children
 * changed has changed nothing inside this one. The last two happen on
 * every frame a lazy list mounts a row, since a layout need is marked
 * all the way up.
 */
function dirtyAbove(frame: RenderChanges['frame'], node: UiNode): boolean {
  for (let ancestor = node.parent; ancestor !== null; ancestor = ancestor.parent) {
    if ((frame.dirtyFlagsFor(ancestor) & INHERITED) !== 0) {
      return true;
    }
  }
  return false;
}

/** What an ancestor's dirt can say about how its descendants look. */
const INHERITED = DirtyFlags.Properties | DirtyFlags.Environment;

/** Whether \`ancestor\` is above \`node\` in the tree. */
function contains(ancestor: UiNode, node: UiNode): boolean {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

/** A container's items: its children, and the children of any fragment among them, in order. */
function itemsOf(container: UiNode): UiNode[] {
  const items: UiNode[] = [];
  const visit = (parent: UiNode): void => {
    for (let child = parent.firstChild; child !== null; child = child.nextSibling) {
      if (child.type === UiNodeType.Fragment) {
        visit(child);
      } else {
        items.push(child);
      }
    }
  };
  visit(container);
  return items;
}

/** The item of a container that holds a node, the node itself if it is one, or null outside the container or above its items. */
function itemHolding(container: UiNode, node: UiNode): UiNode | null {
  let item: UiNode | null = null;
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (current === container) {
      return item;
    }
    if (current.type !== UiNodeType.Fragment) {
      item = current;
    }
  }
  return null;
}

/**
 * Where each sticky node inside a container is drawn, in the
 * container's children's coordinates: its box moved by its own shift
 * and by every sticky ancestor's up to the container. Null when the
 * reader cannot say which nodes are sticky, which no layer can survive.
 */
function stuckIn(container: UiNode, layout: LayoutReader): Map<UiNode, ItemBox> | null {
  const sticky = layout.allStickyNodes?.();
  if (sticky === undefined) {
    return null;
  }
  const drawn = new Map<UiNode, ItemBox>();
  for (const node of sticky) {
    const rec = layout.recordFor(node);
    if (rec === undefined) {
      continue;
    }
    let x = rec.x + rec.stickyOffsetX;
    let y = rec.y + rec.stickyOffsetY;
    let inside = false;
    for (let current = node.parent; current !== null; current = current.parent) {
      if (current === container) {
        inside = true;
        break;
      }
      const above = layout.recordFor(current);
      if (above !== undefined) {
        x += above.stickyOffsetX;
        y += above.stickyOffsetY;
      }
    }
    if (inside) {
      drawn.set(node, { x, y, width: rec.width, height: rec.height });
    }
  }
  return drawn;
}

function sameBox(a: ItemBox, b: ItemBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function boxOf(layout: LayoutReader, node: UiNode): ItemBox | undefined {
  const rec = layout.recordFor(node);
  return rec === undefined ? undefined : { x: rec.x, y: rec.y, width: rec.width, height: rec.height };
}

/**
 * How far past its box, in layout pixels, an item may paint: a focus
 * ring, a shadow, a glyph's overhang. What a damaged item is widened by,
 * and how far past a strip the walk that paints it looks.
 */
export const SPILL = 8;
/** Damage over this share of a layer repaints all of it in one walk. */
const MOSTLY = 0.5;

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

import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { parseTransform } from '../properties/UiTransform';
import type { RenderContext } from './RenderContext';
import { snapScroll } from './ScrollSnap';

/**
 * How far past its box, in layout pixels, a node may paint: a focus
 * ring, a shadow, a glyph's overhang. What a damaged node is widened by,
 * and how far past a rectangle the walk that paints it looks. Canvas2D's
 * scroll layers widen their strips by the same.
 */
export const SPILL = 8;

/** A rectangle of device pixels. */
export interface DamageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type LayerRect = DamageRect;

/**
 * Dirty rectangles: the parts of the surface a frame has to draw again.
 *
 * **Why.** Both renderers cleared the surface and drew every visible
 * node on every frame, so a caret blinking in one field paid for the
 * whole screen: the walk, and the raster of every draw call. When the
 * last frame's pixels are kept, the only part that has to be drawn
 * again is the part that changed. Everything else is already right. A
 * 2D canvas keeps its pixels; WebGPU keeps them in a texture of its own
 * and copies it to the swap chain's texture, which holds nothing known.
 *
 * **What is damaged.** Each node the frame dirtied, where its subtree
 * paints: its record's extent (which takes in its outer shadows and
 * anything that reaches past a box that does not clip), a `SPILL`
 * wider for a focus ring or a glyph's overhang, carried out to the
 * surface through its ancestors' scroll offsets, sticky shifts and
 * transforms, and cut by the clips that hold it in. A node scrolled is
 * one of them: its box is its viewport, which is everything a scroll
 * moves. Added to that, whatever the last frame drew that follows the
 * clock rather than a property (a video, a picture stretched while its
 * scale moves, a caret): drawn again, so it is never left a frame
 * behind.
 *
 * Its own box and no more is enough because nothing moved: a frame in
 * which any box moved (`RenderChanges.geometryVersion`) is drawn whole,
 * so the box a node has now is the box it had when it was last drawn.
 *
 * **When the whole surface is drawn instead.** Whenever the damage is
 * not something this can name, which is:
 *
 *   - no `changes` (a caller drawing frames of its own), or the last
 *     frame threw part way through;
 *   - the first frame, a resize, a new device pixel ratio, a restored
 *     surface or a font that loaded (`invalidate`);
 *   - any box moved, including a transform changing, a sticky node
 *     shifting, a node added or removed;
 *   - the root itself was dirtied, which is how the runtime asks for a
 *     repaint that nothing else describes (a kept subtree drawn sharp,
 *     the inspector) and how a theme changes;
 *   - a turn, a flip or a zero scale above a dirty node, which this
 *     does not carry a box through;
 *   - the inspector's overlay, this frame or the last;
 *   - a scroll above a lifted node, which carries it somewhere its old
 *     pixels do not say; or a lifted node drawn at a lift boundary
 *     rather than over everything, which a walk culled to a rectangle
 *     does not reach from an ancestor the rectangle misses;
 *   - something drawn by the clock inside a layer, a kept subtree or an
 *     opacity group, where where it landed on the surface is not known;
 *   - damage over half the surface, which one walk draws for less.
 *
 * **Lifted nodes.** A popover, a menu, a dialog is drawn over everything
 * else and wherever its anchor puts it, so a walk culled to a rectangle
 * may never reach it from its ancestors. The renderer draws the lifted
 * nodes the last whole frame drew over every partial walk, clipped to
 * its rectangles like everything else (\`Canvas2DRenderer.walk\`, the
 * \`lifted\` a WebGPU build is given), and a change to a lifted node's
 * ancestor (an opacity, a colour passed down) damages the lifted node
 * where it is drawn as well as where the ancestor is.
 *
 * Shared by both renderers: each tells this what it drew by the clock
 * and which lifted nodes it drew, and draws what this hands back.
 */
export class FrameDamage {
  private forced = true;
  private open = false;
  private dpr = 0;
  private width = 0;
  private height = 0;
  private geometry = Number.NaN;
  private overlaid = false;
  /** The lifted nodes the last frame drew, nested ones included. */
  private lifted: readonly UiNode[] = [];
  /** The last frame drew a lifted node at a lift boundary, so the next is drawn whole. */
  private boundaryLifted = false;
  /** Where the last frame drew something that follows the clock, in device pixels. */
  private volatile: LayerRect[] = [];
  private readonly nextVolatile: LayerRect[] = [];
  /** The last frame drew something by the clock somewhere it could not place. */
  private unplaced = false;
  private nextUnplaced = false;
  readonly stats: FrameDamageStats = { whole: 0, partial: 0, rects: 0, pixels: 0 };

  /** The next frame is drawn whole: the surface was cleared or resized, or what it holds was drawn wrong. */
  invalidate(): void {
    this.forced = true;
  }

  resetStats(): void {
    this.stats.whole = 0;
    this.stats.partial = 0;
    this.stats.rects = 0;
    this.stats.pixels = 0;
  }

  /**
   * What this frame has to draw, in device pixels: null for all of it,
   * otherwise the rectangles (none at all when nothing changed).
   */
  begin(root: UiNode, context: RenderContext, dpr: number, width: number, height: number): LayerRect[] | null {
    const interrupted = this.open;
    this.open = true;
    this.nextVolatile.length = 0;
    this.nextUnplaced = false;
    const changes = context.changes;
    const overlaid = context.overlay !== undefined && context.overlay.length > 0;
    const whole =
      this.forced ||
      interrupted ||
      changes === undefined ||
      dpr !== this.dpr ||
      width !== this.width ||
      height !== this.height ||
      changes.geometryVersion !== this.geometry ||
      overlaid ||
      this.overlaid ||
      this.boundaryLifted ||
      this.unplaced;
    this.forced = false;
    this.dpr = dpr;
    this.width = width;
    this.height = height;
    this.geometry = changes?.geometryVersion ?? Number.NaN;
    this.overlaid = overlaid;
    const rects = whole ? null : this.collect(root, context, changes!);
    if (rects === null) {
      this.stats.whole++;
      return null;
    }
    this.stats.partial++;
    this.stats.rects += rects.length;
    for (const rect of rects) {
      this.stats.pixels += rect.width * rect.height;
    }
    return rects;
  }

  /**
   * Notes where something that follows the clock was drawn, so the next
   * frame draws it again. A device-pixel box, or null where the draw
   * went somewhere other than the surface.
   */
  noteVolatile(rect: LayerRect | null): void {
    if (rect === null) {
      this.nextUnplaced = true;
    } else if (rect.width > 0 && rect.height > 0) {
      this.nextVolatile.push(rect);
    }
  }

  /**
   * The frame finished. \`lifted\` is every lifted node it drew over the
   * rest of the frame; \`boundaryLifted\` whether it drew one at a lift
   * boundary instead.
   */
  end(lifted: readonly UiNode[], boundaryLifted: boolean): void {
    this.open = false;
    this.lifted = lifted;
    this.boundaryLifted = boundaryLifted;
    this.unplaced = this.nextUnplaced;
    this.volatile = this.nextVolatile.slice();
  }

  private collect(
    root: UiNode,
    context: RenderContext,
    changes: NonNullable<RenderContext['changes']>
  ): LayerRect[] | null {
    const rects: LayerRect[] = [];
    let area = 0;
    // A rectangle inside one already here adds nothing; one that holds
    // some already here takes their place. The frame lists nodes in no
    // order, and a scrolled grid's cells often came before the grid: each
    // was counted, then the grid over them, and the sum passed half the
    // surface on a frame that drew a third of it.
    const add = (rect: LayerRect): void => {
      if (rects.some(other => covers(other, rect))) {
        return;
      }
      for (let index = rects.length - 1; index >= 0; index--) {
        const other = rects[index]!;
        if (covers(rect, other)) {
          area -= other.width * other.height;
          rects.splice(index, 1);
        }
      }
      rects.push(rect);
      area += rect.width * rect.height;
    };
    for (const rect of this.volatile) {
      add(rect);
    }
    // A lifted node the last whole frame drew that is no longer in the
    // tree was drawn somewhere no node here says: a tooltip on a row a
    // virtual list recycled, in a frame that is otherwise held inside
    // the list (see `LayoutEngine.heldByScroll`).
    for (const lifted of this.lifted) {
      if (lifted !== root && !isAncestor(root, lifted)) {
        return null;
      }
    }
    for (const [node, flags] of changes.frame.entries()) {
      // What a node means is not how it looks.
      if ((flags & ~DirtyFlags.Semantics) === 0) {
        continue;
      }
      if (node === root) {
        return null;
      }
      const rect = this.surfaceRect(node, root, context);
      if (rect === null) {
        return null;
      }
      if (rect !== undefined) {
        add(rect);
      }
      // What an ancestor changes (an opacity, a colour passed down)
      // shows on a lifted node inside it, which is drawn elsewhere; a
      // scroll moves it there, from where it was.
      for (const lifted of this.lifted) {
        if (lifted === node || !isAncestor(node, lifted)) {
          continue;
        }
        if ((flags & DirtyFlags.Transform) !== 0) {
          return null;
        }
        const reach = this.surfaceRect(lifted, root, context);
        if (reach === null) {
          return null;
        }
        if (reach !== undefined) {
          add(reach);
        }
      }
    }
    return area > this.width * this.height * MOSTLY ? null : rects;
  }

  /**
   * Where a node's subtree paints on the surface, in whole device
   * pixels: undefined where it paints nothing that shows (no record, out
   * of the tree, clipped away), null where this cannot say.
   */
  private surfaceRect(node: UiNode, root: UiNode, context: RenderContext): LayerRect | null | undefined {
    const layout = context.layout;
    const rec = layout.recordFor(node);
    if (rec === undefined) {
      // A fragment has no box, and its children paint, inside whatever
      // the nearest ancestor with a box paints: a virtual list keeps
      // its rows under one, and a scroll that recycled them named only
      // the fragment. Anything else without a record is not drawn.
      if (node.type !== UiNodeType.Fragment) {
        return undefined;
      }
      for (let up = node.parent; up !== null; up = up.parent) {
        if (layout.recordFor(up) !== undefined) {
          return this.surfaceRect(up, root, context);
        }
      }
      return null;
    }
    box.left = rec.extentMinX - SPILL;
    box.top = rec.extentMinY - SPILL;
    box.right = rec.extentMaxX + SPILL;
    box.bottom = rec.extentMaxY + SPILL;
    if (!placeThrough(node, rec, box)) {
      return null;
    }
    // A lifted node is drawn outside every clip above it.
    let unclipped = rec.lifted;
    let reached = node === root;
    for (let ancestor = node.parent; ancestor !== null; ancestor = ancestor.parent) {
      if (ancestor === root) {
        reached = true;
      }
      const above = layout.recordFor(ancestor);
      if (above === undefined) {
        continue;
      }
      if (above.scrollable) {
        const dx = snapScroll(above.scrollX, this.dpr);
        const dy = snapScroll(above.scrollY, this.dpr);
        box.left -= dx;
        box.right -= dx;
        box.top -= dy;
        box.bottom -= dy;
      }
      if (above.clips && !unclipped) {
        // A pixel wider than the box, for the device pixel its edges
        // are snapped out to.
        box.left = Math.max(box.left, above.x - 1);
        box.top = Math.max(box.top, above.y - 1);
        box.right = Math.min(box.right, above.x + above.width + 1);
        box.bottom = Math.min(box.bottom, above.y + above.height + 1);
        if (box.right <= box.left || box.bottom <= box.top) {
          return undefined;
        }
      }
      if (!placeThrough(ancestor, above, box)) {
        return null;
      }
      if (above.lifted) {
        unclipped = true;
      }
    }
    if (!reached) {
      return undefined;
    }
    const dpr = this.dpr;
    const left = Math.max(0, Math.floor(box.left * dpr));
    const top = Math.max(0, Math.floor(box.top * dpr));
    const right = Math.min(this.width, Math.ceil(box.right * dpr));
    const bottom = Math.min(this.height, Math.ceil(box.bottom * dpr));
    return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : undefined;
  }
}

/** What the damage did, for the specs and the benchmark. */
export interface FrameDamageStats {
  /** Frames drawn whole. */
  whole: number;
  /** Frames that drew only their damage, including those with none. */
  partial: number;
  /** Rectangles drawn across the partial frames. */
  rects: number;
  /** Device pixels in them. */
  pixels: number;
}

/** Damage over this share of the surface draws all of it in one walk. */
const MOSTLY = 0.5;

/** The box being carried out to the surface; one, since a frame places one at a time. */
const box = { left: 0, top: 0, right: 0, bottom: 0 };

/**
 * Carries the box out through a node's own sticky shift and transform,
 * as `renderNode` applies them: drawn at shift + translate + origin +
 * scale·(p − origin). False for a turn, a flip or a zero scale.
 */
function placeThrough(
  node: UiNode,
  rec: { x: number; y: number; stickyOffsetX: number; stickyOffsetY: number },
  into: typeof box
): boolean {
  const raw = node.properties.get('transform');
  const transform = raw === undefined ? undefined : parseTransform(raw);
  if (transform !== undefined) {
    if (transform.rotation !== 0 || !(transform.scaleX > 0) || !(transform.scaleY > 0)) {
      return false;
    }
    const originX = rec.x + transform.x;
    const originY = rec.y + transform.y;
    into.left = transform.translateX + originX + transform.scaleX * (into.left - originX);
    into.right = transform.translateX + originX + transform.scaleX * (into.right - originX);
    into.top = transform.translateY + originY + transform.scaleY * (into.top - originY);
    into.bottom = transform.translateY + originY + transform.scaleY * (into.bottom - originY);
  }
  into.left += rec.stickyOffsetX;
  into.right += rec.stickyOffsetX;
  into.top += rec.stickyOffsetY;
  into.bottom += rec.stickyOffsetY;
  return true;
}

/** Whether \`ancestor\` is above \`node\` in the tree. */
function isAncestor(ancestor: UiNode, node: UiNode): boolean {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

/**
 * Rectangles grouped so that each group is one walk: a layer's strips
 * on Canvas2D, a frame's damage on either renderer.
 *
 * Two rectangles share a group when less than `reach` separates them,
 * which is when their walks, each a spill wider than its rectangles,
 * would meet. Rectangles in different groups therefore never overlap,
 * and nor do the groups' bounding boxes, so nothing is painted twice. A
 * group keeps its rectangles in the order they came, and the groups go
 * in the order of their first rectangle.
 *
 * Merged by repeated passes rather than one: joining two rectangles can
 * bring the group within reach of a third that neither was near alone.
 * A frame has a handful of rectangles, so the passes cost nothing.
 */
export function damageGroups(strips: readonly LayerRect[], reach: number): LayerRect[][] {
  const groups = strips.map(strip => ({ strips: [strip], box: { ...strip } }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length && !merged; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i].box;
        const b = groups[j].box;
        const apart =
          b.x - (a.x + a.width) >= reach ||
          a.x - (b.x + b.width) >= reach ||
          b.y - (a.y + a.height) >= reach ||
          a.y - (b.y + b.height) >= reach;
        if (apart) {
          continue;
        }
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        groups[i] = {
          strips: [...groups[i].strips, ...groups[j].strips],
          box: {
            x,
            y,
            width: Math.max(a.x + a.width, b.x + b.width) - x,
            height: Math.max(a.y + a.height, b.y + b.height) - y
          }
        };
        groups.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return groups.map(group => group.strips);
}

/** The smallest rectangle holding every one of \`rects\`, which is not empty. */
export function boundingRect(rects: readonly LayerRect[]): LayerRect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function covers(outer: LayerRect, inner: LayerRect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

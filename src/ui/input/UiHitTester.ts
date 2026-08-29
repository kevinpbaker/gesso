import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import type { LayoutRecord } from '../layout/LayoutRecord';
import { isNodeHitTestable, isNodeInert } from './UiInteraction';
import { pointInBox, scrollbarThumb, scrollbarZoneAt, type ScrollbarAxis } from '../layout/Scrollbars';

/**
 * Read access to layout records for hit testing.
 *
 * LayoutEngine satisfies this structurally. The interface exists so
 * the hit tester is coupled to a geometry projection, not to the
 * concrete engine, and so a future implementation could be fed
 * transferable geometry in a Worker.
 */
export interface HitTestLayoutReader {
  recordFor(node: UiNode): LayoutRecord | undefined;
}

export interface UiPoint {
  x: number;
  y: number;
}

/**
 * The result of a successful hit: the topmost node under the point
 * plus the point expressed in that node's local (untransformed,
 * pre-scroll) coordinates.
 */
export interface HitTestResult {
  node: UiNode;
  localX: number;
  localY: number;
  /**
   * Set when the point is on a scroll container's scrollbar: which axis,
   * and whether it is on the thumb (drag) or the track beside it (page).
   * `node` is the container. Only a visible bar, or its thumb, takes the
   * hit; otherwise content underneath wins.
   */
  scrollbar?: { axis: ScrollbarAxis; onThumb: boolean };
}

/**
 * Abstraction over hit testing.
 *
 * The initial implementation is a reverse-paint-order tree walk
 * (O(n) worst case, but only the nodes on the pointer path are
 * descended). Later implementations could back this interface with
 * a spatial hash, an R-tree, a grid, or GPU picking without the
 * pointer pipeline changing.
 */
export interface HitTester {
  hitTest(x: number, y: number): HitTestResult | null;
  /** Converts a canvas-space point into a node's local coordinates. */
  toLocal(node: UiNode, x: number, y: number): UiPoint;
  /**
   * The scroll container whose scrollbar band the point is in, visible
   * or not — the pointer controller reveals bars as the pointer nears
   * them. Null away from any bar.
   */
  scrollbarZoneAt(x: number, y: number): { node: UiNode; axis: ScrollbarAxis } | null;
}

/**
 * Affine inverse-transform scratch. Non-allocating hit traversal.
 *
 * Node transforms mirror the renderer's CTM exactly:
 *   world = T(origin) · R(θ) · S(sx, sy) · T(-origin) · local
 * with origin = (record.x + transform.x, record.y + transform.y).
 * The inverse maps a world point back into the node's record space,
 * where its layout box is tested directly. Identity transforms
 * round-trip exactly, so no "is it transformed?" branch is needed.
 */
interface TransformScratch {
  x: number;
  y: number;
}

/**
 * Tree-walking hit tester.
 *
 * Traverses the retained UiNode tree in the inverse of paint order
 * (last child first, because it paints on top), carrying clipping
 * and scroll state implicitly:
 *
 *   - Scroll containers clip to their viewport record rect, then
 *     shift the point by (scrollX, scrollY) before testing
 *     descendants, whose records are pre-scroll content coords.
 *   - Every node applies its affine inverse transform so rotated /
 *     scaled boxes are tested in their own record space.
 *   - Inert subtrees (disabled, pointerEvents:none, invisible,
 *     opacity 0) are skipped entirely; nodes with
 *     hitTestable:false are skipped as candidates but still expose
 *     their children.
 *
 * Descendant tests run before the node itself because children
 * paint on top of the parent's background. No per-node allocations
 * happen on the traversal path; a result object is produced only
 * when a hit is found.
 */
export class UiHitTester implements HitTester {
  private readonly point: TransformScratch = { x: 0, y: 0 };
  private readonly result = new HitScratch();
  /** True while answering scrollbarZoneAt: bands count, content does not. */
  private zoneOnly = false;
  /** Root-to-node scratch for toLocal, reused so a pointer drag allocates nothing. */
  private readonly path: UiNode[] = [];

  constructor(
    private layout: HitTestLayoutReader,
    private root: UiNode
  ) {}

  /** The node traversal starts from (normally the layout root). */
  setRoot(root: UiNode): void {
    this.root = root;
  }

  hitTest(x: number, y: number): HitTestResult | null {
    this.result.scrollbar = undefined;
    this.zoneOnly = false;
    if (this.hitTestNode(this.root, x, y)) {
      const result: HitTestResult = { node: this.result.node!, localX: this.result.localX, localY: this.result.localY };
      const scrollbar = this.result.takeScrollbar();
      if (scrollbar !== undefined) {
        result.scrollbar = scrollbar;
      }
      return result;
    }
    return null;
  }

  scrollbarZoneAt(x: number, y: number): { node: UiNode; axis: ScrollbarAxis } | null {
    this.result.scrollbar = undefined;
    this.zoneOnly = true;
    const hit = this.hitTestNode(this.root, x, y);
    this.zoneOnly = false;
    const scrollbar = this.result.takeScrollbar();
    if (hit && scrollbar !== undefined) {
      return { node: this.result.node!, axis: scrollbar.axis };
    }
    return null;
  }

  /**
   * A canvas point in a node's local coordinates.
   *
   * This has to replay the descent `hitTest` makes rather than undo
   * the node's own transform alone: records stay in pre-scroll
   * coordinates, so a node inside a scrolled container sits at a
   * record y the pointer's canvas y knows nothing about. The walk
   * applies each ancestor's inverse transform, sticky shift and
   * scroll offset in the same order the traversal does, so the answer
   * agrees with `hitTest`'s `localX`/`localY` for the node it hit —
   * which is what places the caret from a click inside a scrolled
   * editable.
   */
  toLocal(node: UiNode, x: number, y: number): UiPoint {
    const rec = this.layout.recordFor(node);
    if (rec === undefined) {
      return { x, y };
    }
    const path = this.path;
    path.length = 0;
    // Fragments carry no record and are traversed transparently.
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      if (current.type !== UiNodeType.Fragment) {
        path.push(current);
      }
      if (current === this.root) {
        break;
      }
    }
    let px = x;
    let py = y;
    for (let i = path.length - 1; i >= 0; i--) {
      const ancestor = path[i];
      const record = this.layout.recordFor(ancestor);
      if (record === undefined) {
        continue;
      }
      // A degenerate transform draws nothing, so there is no sensible
      // point to map through it: leave it as the identity.
      if (this.invertPoint(ancestor, record, px, py)) {
        px = this.point.x;
        py = this.point.y;
      }
      px -= record.stickyOffsetX;
      py -= record.stickyOffsetY;
      if (i > 0 && record.clips && record.scrollable) {
        px += record.scrollX;
        py += record.scrollY;
      }
    }
    path.length = 0;
    return { x: px - rec.x, y: py - rec.y };
  }

  // -------------------------------------------------------------------------
  // Traversal
  // -------------------------------------------------------------------------

  private hitTestNode(node: UiNode, x: number, y: number): boolean {
    if (isNodeInert(node)) {
      return false;
    }
    const rec = this.layout.recordFor(node);
    if (rec === undefined) {
      return false;
    }
    if (!this.invertPoint(node, rec, x, y)) {
      // Degenerate (zero-scale) transform: nothing is drawn, nothing hits.
      return false;
    }
    // A sticky node is drawn shifted from its record; undo the shift
    // so the record box (and the children, drawn with it) can be tested.
    const px = this.point.x - rec.stickyOffsetX;
    const py = this.point.y - rec.stickyOffsetY;

    if (rec.clips) {
      // The clip is the node's own box: outside it nothing of this
      // subtree can be hit. Descendants of a scroll container live in
      // pre-scroll content coordinates, so the point is shifted by the
      // scroll offset after the clip passes.
      if (px < rec.x || px >= rec.x + rec.width || py < rec.y || py >= rec.y + rec.height) {
        return false;
      }
      if (rec.scrollable && this.hitScrollbar(node, rec, px, py)) {
        return true;
      }
      if (this.zoneOnly) {
        // Looking for a bar band only: descend, but never land on content.
        const shiftX = rec.scrollX;
        const shiftY = rec.scrollY;
        return this.hitTestChildren(node, px + shiftX, py + shiftY);
      }
      const shiftX = rec.scrollable ? rec.scrollX : 0;
      const shiftY = rec.scrollable ? rec.scrollY : 0;
      if (this.hitTestChildren(node, px + shiftX, py + shiftY)) {
        return true;
      }
      return isNodeHitTestable(node) && this.recordHit(node, rec, px, py);
    }

    // Non-clipping nodes let children paint outside them, so children
    // are tested regardless of whether the point falls inside the box.
    if (this.hitTestChildren(node, px, py)) {
      return true;
    }
    if (this.zoneOnly || !isNodeHitTestable(node)) {
      return false;
    }
    if (px < rec.x || px >= rec.x + rec.width || py < rec.y || py >= rec.y + rec.height) {
      return false;
    }
    return this.recordHit(node, rec, px, py);
  }

  private hitTestChildren(parent: UiNode, x: number, y: number): boolean {
    // zIndex reordered these children: the topmost paints last, so it
    // is tested first. Fragments are already expanded in the order.
    const order = this.layout.recordFor(parent)?.paintOrder;
    if (order !== null && order !== undefined) {
      for (let i = order.length - 1; i >= 0; i--) {
        if (this.hitTestNode(order[i], x, y)) {
          return true;
        }
      }
      return false;
    }
    for (let child = parent.lastChild; child !== null; child = child.previousSibling) {
      if (child.type === UiNodeType.Fragment) {
        if (this.hitTestChildren(child, x, y)) {
          return true;
        }
        continue;
      }
      if (this.hitTestNode(child, x, y)) {
        return true;
      }
    }
    return false;
  }

  private recordHit(node: UiNode, rec: LayoutRecord, px: number, py: number): boolean {
    this.result.node = node;
    this.result.localX = px - rec.x;
    this.result.localY = py - rec.y;
    return true;
  }

  /**
   * Scrollbars paint above a container's children, so they are tested
   * before them. The thumb always takes the hit; the rest of the band
   * only while the bar is showing (or when asked for the band alone).
   */
  private hitScrollbar(node: UiNode, rec: LayoutRecord, px: number, py: number): boolean {
    const axis = scrollbarZoneAt(rec, px, py);
    if (axis === null) {
      return false;
    }
    const bar = scrollbarThumb(rec, axis);
    if (bar === null) {
      return false;
    }
    const onThumb = pointInBox(bar.thumb, px, py);
    const visible = rec.scrollbarVisibleUntil > (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!onThumb && !visible && !this.zoneOnly) {
      return false;
    }
    this.recordHit(node, rec, px, py);
    this.result.scrollbar = { axis, onThumb };
    return true;
  }

  // -------------------------------------------------------------------------
  // Inverse affine transform
  // -------------------------------------------------------------------------

  /**
   * Maps (x, y) into the node's record space. Writes into the shared
   * scratch and returns false when the transform is degenerate.
   */
  private invertPoint(node: UiNode, rec: LayoutRecord, x: number, y: number): boolean {
    let scaleX = 1;
    let scaleY = 1;
    let rotation = 0;
    let offsetX = 0;
    let offsetY = 0;
    const raw = node.properties.get('transform');
    if (typeof raw === 'object' && raw !== null) {
      const transform = raw as Partial<Record<'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation', unknown>>;
      scaleX = toFinite(transform.scaleX) ?? 1;
      scaleY = toFinite(transform.scaleY) ?? 1;
      rotation = toFinite(transform.rotation) ?? 0;
      offsetX = toFinite(transform.x) ?? 0;
      offsetY = toFinite(transform.y) ?? 0;
    }
    if (scaleX <= 0 || scaleY <= 0) {
      return false;
    }
    const originX = rec.x + offsetX;
    const originY = rec.y + offsetY;
    const dx = x - originX;
    const dy = y - originY;
    if (rotation === 0) {
      this.point.x = dx / scaleX + originX;
      this.point.y = dy / scaleY + originY;
      return true;
    }
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rotatedX = dx * cos + dy * sin;
    const rotatedY = -dx * sin + dy * cos;
    this.point.x = rotatedX / scaleX + originX;
    this.point.y = rotatedY / scaleY + originY;
    return true;
  }
}

/** Mutable hit output so the traversal path allocates nothing. */
class HitScratch {
  node: UiNode | null = null;
  localX = 0;
  localY = 0;
  scrollbar: { axis: ScrollbarAxis; onThumb: boolean } | undefined = undefined;

  /** Read through a method so a prior reset does not narrow the field to undefined. */
  takeScrollbar(): { axis: ScrollbarAxis; onThumb: boolean } | undefined {
    return this.scrollbar;
  }
}

function toFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

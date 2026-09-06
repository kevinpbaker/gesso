import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import type { LayoutRecord } from './LayoutRecord';

/**
 * A conservative box around everything in a subtree that could take a
 * point, in the coordinate space that subtree's own record lives in.
 *
 * Hit testing descends into every child of a non-clipping node,
 * because a child is free to paint outside its parent; a list of a
 * thousand rows is therefore descended into a thousand times for a
 * point inside exactly one of them. These bounds are what lets the
 * walk pass a subtree over: the point is outside the box, so nothing
 * inside the subtree can hold it.
 *
 * The one rule that matters is that the box is never smaller than the
 * true hit area. Too large costs a descent that finds nothing, which
 * is the behaviour hit testing had before these existed. Too small
 * loses a click, silently, at a position where something is plainly
 * drawn. So anything a bottom-up union cannot honestly summarise is
 * left `boundsUnbounded` instead of approximated, and that flag is
 * carried up to every ancestor whose union included it.
 *
 * This is the read view of five fields that live on `LayoutRecord`
 * itself. They are flat scalars, and not a box object hanging off the
 * record, for the reason every other number on a record is one: they
 * are filled by a walk of the whole tree, and an extra object a node
 * is an extra pointer to chase on a walk that is memory bound before
 * it is anything else.
 */
export interface SubtreeBounds {
  readonly boundsMinX: number;
  readonly boundsMinY: number;
  readonly boundsMaxX: number;
  readonly boundsMaxY: number;
  /**
   * True when the box says nothing and the subtree has to be descended
   * into. It starts true so a record nobody has filled in yet, one
   * outside the walked tree above all, is never trusted.
   */
  readonly boundsUnbounded: boolean;
}

/**
 * Fills in the subtree bounds of every record under `root`, bottom up.
 *
 * The traversal mirrors the hit tester's exactly, `paintOrder` and
 * transparent fragments included, so the set of nodes a box covers is
 * the set of nodes the descent it replaces would have reached.
 */
export function fillSubtreeBounds(root: UiNode, records: ReadonlyMap<UiNode, LayoutRecord>): void {
  fillNode(root, records);
}

/**
 * A node's bounds, and its whole subtree's on the way there. Returns
 * null for a node with no record, a fragment above all, which has
 * nothing of its own to contribute to its parent's box.
 */
function fillNode(node: UiNode, records: ReadonlyMap<UiNode, LayoutRecord>): LayoutRecord | null {
  const rec = records.get(node);
  if (rec === undefined) {
    return null;
  }
  rec.boundsMinX = rec.x;
  rec.boundsMinY = rec.y;
  rec.boundsMaxX = rec.x + rec.width;
  rec.boundsMaxY = rec.y + rec.height;
  rec.boundsUnbounded = isUnbounded(node, rec);
  // A clipping node rejects a point outside its own box before it
  // looks at a single child, so its box is the whole answer and a
  // descendant that reaches past it changes nothing. That is also
  // where an unbounded descendant stops propagating: whatever a
  // transform inside the clip does, the clip still holds.
  //
  // The children are filled in either way, because the descent that
  // does happen inside the clip consults them.
  fillChildren(node, rec.paintOrder, records, rec.clips ? null : rec);
  return rec;
}

function fillChildren(
  parent: UiNode,
  order: UiNode[] | null,
  records: ReadonlyMap<UiNode, LayoutRecord>,
  into: LayoutRecord | null
): void {
  if (order !== null) {
    for (let i = 0; i < order.length; i++) {
      union(into, fillNode(order[i], records));
    }
    return;
  }
  for (let child = parent.firstChild; child !== null; child = child.nextSibling) {
    if (child.type === UiNodeType.Fragment) {
      // Fragments carry no record of their own, so they have no paint
      // order to read and their children belong to whatever box this
      // walk is filling.
      fillChildren(child, null, records, into);
    } else {
      union(into, fillNode(child, records));
    }
  }
}

function union(into: LayoutRecord | null, child: LayoutRecord | null): void {
  if (into === null || child === null) {
    return;
  }
  if (child.boundsUnbounded) {
    into.boundsUnbounded = true;
    return;
  }
  if (child.boundsMinX < into.boundsMinX) {
    into.boundsMinX = child.boundsMinX;
  }
  if (child.boundsMinY < into.boundsMinY) {
    into.boundsMinY = child.boundsMinY;
  }
  if (child.boundsMaxX > into.boundsMaxX) {
    into.boundsMaxX = child.boundsMaxX;
  }
  if (child.boundsMaxY > into.boundsMaxY) {
    into.boundsMaxY = child.boundsMaxY;
  }
}

/**
 * Whether a node's own hit area is something its parent's box cannot
 * describe.
 *
 * A transform is the first case. The hit tester inverts the point into
 * a node's local space before it compares anything, so the box a
 * parent would test the point against is in the space the transform
 * moved the node out of: a node translated three hundred pixels up is
 * hit three hundred pixels up and bounded where it is not. Mapping the
 * box forward through the transform is possible, and rotation makes it
 * fiddly enough to be worth doing on its own evidence rather than
 * here; until then a transformed node is simply always descended into.
 *
 * Sticky is the second. A sticky node is drawn, and hit, shifted from
 * its record by an offset `applySticky` writes after placement, and
 * the shift moves the node's whole subtree without moving a single
 * box. The shifted box is knowable here, but it is knowable only
 * because the walk runs after layout has settled, and that is a
 * thinner reason than the rule these bounds are held to. Sticky nodes
 * are few, and every one of them sits inside a scroll container, whose
 * clip stops the flag going any further.
 *
 * Anchored nodes are deliberately not on this list. An anchored
 * overlay is re-placed after the pass that moved its anchor, but every
 * such move writes a box, and a written box invalidates these bounds,
 * so the walk that fills them always runs against the boxes an anchor
 * settled on.
 */
function isUnbounded(node: UiNode, rec: LayoutRecord): boolean {
  if (rec.sticky) {
    return true;
  }
  const transform = node.properties.get('transform');
  return typeof transform === 'object' && transform !== null;
}

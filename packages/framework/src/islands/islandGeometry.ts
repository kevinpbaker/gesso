import { UiNodeType, type UiNode } from 'gesso-core';
import type { IslandRect } from './IslandProtocol';

/**
 * The part of the layout engine an island's placement is read from.
 * `LayoutEngine` is one; a spec passes a table.
 */
export interface IslandGeometrySource {
  recordFor(node: UiNode):
    | {
        readonly width: number;
        readonly height: number;
        readonly clips: boolean;
        readonly lifted: boolean;
        readonly scrollable: boolean;
      }
    | undefined;
  screenBox(node: UiNode): IslandRect;
  allStickyNodes(): ReadonlySet<UiNode>;
}

/** Where an island is seen, how much of it, and what covers it. */
export interface IslandGeometry {
  readonly visible: boolean;
  readonly box: IslandRect;
  readonly clip: IslandRect;
  readonly cuts: IslandRect[];
  readonly opacity: number;
  /**
   * Something transparent that takes presses lies over the island: the
   * backdrop a menu or a popover spreads to close on an outside press.
   * The element stays in sight and takes no pointer, so the press goes
   * to the backdrop as it would over any canvas content.
   */
  readonly inert: boolean;
}

const EMPTY: IslandRect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Reads an island's placement from this frame's layout.
 *
 * The clip is the viewport cut down by every clipping ancestor's box, as
 * the renderer clips the node's paint, up to a lifted node: what is
 * lifted paints above the tree and outside its ancestors' clips. The
 * opacity is the product of the node's and its ancestors', so a dialog
 * fading in fades its fields with it. A node under `visible: false` is
 * not visible, whatever its box says.
 *
 * The cuts are what the canvas draws over the island, which the element
 * has to be cut away under, or a menu opened over a field would open
 * under the field:
 *
 *   - every entry of an overlay layer, unless the island is in that
 *     layer, when only the entries after its own (store order is paint
 *     order there). An entry that paints nothing, the backdrop a menu
 *     spreads to close on an outside press, does not cut: it makes the
 *     island `inert` instead;
 *   - every sticky node scrolled by a container the island is scrolled
 *     by too, which is a header stuck over a form scrolled under it.
 *
 * Rectangles, all of them: a menu's rounded corner is cut square, and
 * canvas content that is neither overlaid nor sticky does not cut (it is
 * drawn under the element). Both are said where islands are documented.
 */
export function islandGeometry(
  node: UiNode,
  source: IslandGeometrySource,
  viewport: IslandRect,
  layers: Iterable<UiNode>
): IslandGeometry {
  const rec = source.recordFor(node);
  if (rec === undefined || !(rec.width > 0) || !(rec.height > 0)) {
    return { visible: false, box: EMPTY, clip: EMPTY, cuts: [], opacity: 0, inert: false };
  }
  const box = source.screenBox(node);
  let clip: IslandRect | null = viewport;
  let opacity = 1;
  let shown = true;
  let lifted = rec.lifted;
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (current.properties.get('visible') === false) {
      shown = false;
    }
    const own = current.properties.get('opacity');
    if (typeof own === 'number') {
      opacity *= own;
    }
    if (current === node || lifted) {
      continue;
    }
    const ancestor = source.recordFor(current);
    if (ancestor === undefined) {
      continue;
    }
    if (ancestor.clips && clip !== null) {
      clip = intersect(clip, source.screenBox(current));
    }
    lifted = ancestor.lifted;
  }
  const seen = clip === null ? null : intersect(clip, box);
  if (!shown || opacity <= 0 || seen === null) {
    return { visible: false, box, clip: clip ?? EMPTY, cuts: [], opacity, inert: false };
  }
  const cuts: IslandRect[] = [];
  let inert = false;
  const cutBy = (other: UiNode, entry: boolean): void => {
    const cut = intersect(seen, source.screenBox(other));
    if (cut === null) {
      return;
    }
    if (entry && other.firstChild === null && other.properties.get('backgroundColor') === undefined) {
      // Paints nothing: an outside-press backdrop. It takes the press
      // and hides nothing.
      inert = true;
    } else {
      cuts.push(cut);
    }
  };
  for (const layer of layers) {
    // Outside the layer, all of it is above; inside, what comes after.
    let above = !contains(layer, node);
    for (const entry of entriesOf(layer)) {
      if (above) {
        cutBy(entry, true);
      } else if (contains(entry, node)) {
        above = true;
      }
    }
  }
  const scrollers = scrollersOf(node, source);
  if (scrollers.size > 0) {
    for (const sticky of source.allStickyNodes()) {
      if (related(sticky, node)) {
        continue;
      }
      const scroller = nearestScroller(sticky, source);
      if (scroller !== null && scrollers.has(scroller)) {
        cutBy(sticky, false);
      }
    }
  }
  return { visible: true, box, clip: clip ?? EMPTY, cuts, opacity, inert };
}

/** The overlap of two rectangles, or null when they do not overlap. */
export function intersect(a: IslandRect, b: IslandRect): IslandRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) {
    return null;
  }
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * What is left of `from` once every rectangle in `cuts` is taken away,
 * as rectangles that do not overlap.
 *
 * Each cut splits every piece it touches into at most four (the bands
 * above and below it, and the parts beside it between them), so holes
 * that overlap each other come out right. A `clip-path` with the
 * even-odd rule, which is the obvious way to punch holes, would fill a
 * place two holes share back in.
 */
export function subtractRects(from: IslandRect, cuts: readonly IslandRect[]): IslandRect[] {
  let pieces: IslandRect[] = [from];
  for (const cut of cuts) {
    const next: IslandRect[] = [];
    for (const piece of pieces) {
      const overlap = intersect(piece, cut);
      if (overlap === null) {
        next.push(piece);
        continue;
      }
      const right = piece.x + piece.width;
      const bottom = piece.y + piece.height;
      const overlapBottom = overlap.y + overlap.height;
      const overlapRight = overlap.x + overlap.width;
      if (overlap.y > piece.y) {
        next.push({ x: piece.x, y: piece.y, width: piece.width, height: overlap.y - piece.y });
      }
      if (overlapBottom < bottom) {
        next.push({ x: piece.x, y: overlapBottom, width: piece.width, height: bottom - overlapBottom });
      }
      if (overlap.x > piece.x) {
        next.push({ x: piece.x, y: overlap.y, width: overlap.x - piece.x, height: overlap.height });
      }
      if (overlapRight < right) {
        next.push({ x: overlapRight, y: overlap.y, width: right - overlapRight, height: overlap.height });
      }
    }
    pieces = next;
  }
  return pieces;
}

/**
 * A layer's entries in paint order: its children, with a fragment (what
 * an observable child is realised as) read through to its own.
 */
function entriesOf(layer: UiNode): UiNode[] {
  const entries: UiNode[] = [];
  const visit = (parent: UiNode): void => {
    for (let child = parent.firstChild; child !== null; child = child.nextSibling) {
      if (child.type === UiNodeType.Fragment) {
        visit(child);
      } else {
        entries.push(child);
      }
    }
  };
  visit(layer);
  return entries;
}

/** Whether one node is the other or contains it. */
function related(a: UiNode, b: UiNode): boolean {
  return contains(a, b) || contains(b, a);
}

function contains(ancestor: UiNode, node: UiNode): boolean {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

function scrollersOf(node: UiNode, source: IslandGeometrySource): Set<UiNode> {
  const found = new Set<UiNode>();
  for (let current = node.parent; current !== null; current = current.parent) {
    if (source.recordFor(current)?.scrollable === true) {
      found.add(current);
    }
  }
  return found;
}

function nearestScroller(node: UiNode, source: IslandGeometrySource): UiNode | null {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (source.recordFor(current)?.scrollable === true) {
      return current;
    }
  }
  return null;
}

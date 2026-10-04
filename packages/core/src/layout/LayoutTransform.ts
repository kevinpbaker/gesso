import type { LayoutRecord } from './LayoutRecord';
import type { UiNode } from '../graph/UiNode';
import { parseTransform } from '../properties/UiTransform';

export interface Transform {
  x: number;
  y: number;
}

/**
 * Maps a container's content space into its own outer
 * coordinate space.
 *
 * Content starts at the box origin plus padding, then scroll
 * shifts it, so the mapping is a pure translation. Descendant
 * layout boxes never change when scroll does.
 */
export function contentOffset(record: LayoutRecord): Transform {
  return {
    x: record.paddingLeft - record.scrollX,
    y: record.paddingTop - record.scrollY
  };
}

/**
 * Reads the world position of a node in layout coordinates.
 *
 * LayoutRecords store x/y already in absolute layout-root
 * space: placers compute child positions as
 * `parent.x + parent.padding + offset`, so every box is
 * expressed relative to the layout root with no chain walk
 * required. Scroll translation is intentionally excluded —
 * it is applied separately per scroll container via
 * contentOffset.
 *
 * Writes into out (a mutable x/y holder) to avoid allocation in
 * hot paths.
 */
export function accumulatedOffsetTo(
  node: UiNode,
  records: ReadonlyMap<UiNode, LayoutRecord>,
  out: { x: number; y: number }
): void {
  const record = records.get(node);
  if (record === undefined) {
    out.x = 0;
    out.y = 0;
    return;
  }
  out.x = record.x;
  out.y = record.y;
}

/**
 * Whether a node or any ancestor carries a `transform`.
 *
 * The same test `layoutForFrame` makes, an object rather than a
 * parsed non-identity transform: it is the question a caller asks to
 * take the plain additive path, so an identity object costs it only
 * the general one, which gives the same answer.
 */
export function hasTransformedChain(node: UiNode | null): boolean {
  for (let current = node; current !== null; current = current.parent) {
    const transform = current.properties.get('transform');
    if (typeof transform === 'object' && transform !== null) {
      return true;
    }
  }
  return false;
}

/**
 * Carries points in a node's record space out to its parent's: through
 * its transform (unless `withTransform` is false), then its sticky
 * shift. The order is the renderer's
 * (`Canvas2DRenderer` translates by the sticky shift and then applies
 * `T(translate) · T(pivot) · R · S · T(-pivot)` about the record box),
 * because the point of this is to agree with where the node is drawn.
 *
 * `points` is x, y pairs, written in place.
 */
export function transformPointsOut(
  node: UiNode,
  record: LayoutRecord,
  points: Float64Array,
  withTransform = true
): void {
  const transform = withTransform ? parseTransform(node.properties.get('transform')) : undefined;
  for (let i = 0; i < points.length; i += 2) {
    let x = points[i]!;
    let y = points[i + 1]!;
    if (transform !== undefined) {
      const originX = record.x + transform.x;
      const originY = record.y + transform.y;
      const dx = (x - originX) * transform.scaleX;
      const dy = (y - originY) * transform.scaleY;
      const cos = Math.cos(transform.rotation);
      const sin = Math.sin(transform.rotation);
      x = originX + dx * cos - dy * sin + transform.translateX;
      y = originY + dx * sin + dy * cos + transform.translateY;
    }
    points[i] = x + record.stickyOffsetX;
    points[i + 1] = y + record.stickyOffsetY;
  }
}

/**
 * The inverse of `transformPointsOut`: points in a node's parent's space
 * brought into the node's record space. A degenerate (zero-scale)
 * transform draws nothing and has no inverse, so it is left out, as
 * `UiHitTester.toLocal` leaves it out.
 */
export function transformPointsIn(node: UiNode, record: LayoutRecord, points: Float64Array): void {
  const transform = parseTransform(node.properties.get('transform'));
  const invertible = transform !== undefined && transform.scaleX !== 0 && transform.scaleY !== 0;
  for (let i = 0; i < points.length; i += 2) {
    let x = points[i]! - record.stickyOffsetX;
    let y = points[i + 1]! - record.stickyOffsetY;
    if (invertible) {
      const originX = record.x + transform.x;
      const originY = record.y + transform.y;
      const dx = x - transform.translateX - originX;
      const dy = y - transform.translateY - originY;
      const cos = Math.cos(transform.rotation);
      const sin = Math.sin(transform.rotation);
      x = (dx * cos + dy * sin) / transform.scaleX + originX;
      y = (-dx * sin + dy * cos) / transform.scaleY + originY;
    }
    points[i] = x;
    points[i + 1] = y;
  }
}

import type { LayoutRecord } from '../layout/LayoutRecord';
import type { UiNode } from '../graph/UiNode';
import type { UiColor } from '../properties/UiColor';
import type { UiColorValue } from '../properties/UiPropertyValues';
import { resolveColorValue } from '../properties/UiThemeColor';

/**
 * What a modifier may put on screen, and the only thing it may.
 *
 * A decoration is the sibling of `OverlayShape` for the inside of a
 * frame rather than the top of it. The differences are the whole
 * point of having two vocabularies:
 *
 * | | `OverlayShape` | `DecorationShape` |
 * | --- | --- | --- |
 * | Coordinates | layout-root pixels | node-local, from the node's border box |
 * | Painted | over the finished scene | in the node's own paint pass |
 * | Clip / transform / opacity | none | the node's ancestors' |
 * | Colour | a CSS string | a `UiColorValue`, so a palette name works |
 *
 * That third row is why a focus ring is a decoration and not an
 * overlay: a ring on a row scrolled half out of a `ScrollView` has to
 * be cut off with the row, and a ring on a transformed card has to
 * turn with it. An overlay drawn over the finished scene can do
 * neither.
 *
 * **A decoration is clipped by the node's ancestors and not by the
 * node itself.** It is painted where the node's own background and
 * border are painted, outside the node's own clip — which is the only
 * rule under which a ring with an `outset` is visible at all, since
 * every pixel of it lies outside the box that would clip it.
 */
export type DecorationShape = DecorationFill | DecorationStroke;

interface DecorationBox {
  /**
   * The rectangle, in the node's own coordinates: `(0, 0)` is the
   * top-left of its border box — the box its background fills — and
   * the defaults are the whole of it.
   */
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  /**
   * The far edges, as distances inward from the node's right and
   * bottom. Any two of `x`, `width`, `right` fix the horizontal axis,
   * exactly as CSS's `left`, `width` and `right` do, and likewise
   * `y`, `height`, `bottom`.
   *
   *   { y: 0, height: 2 }                 the top edge, two pixels
   *   { bottom: 0, height: 2 }            the bottom edge
   *   { x: 0, width: 2, y: 2, bottom: 2 } the left edge, between them
   *
   * Without them a shape could only be placed from the top left, and
   * `width` and `height` only defaulted to the node's own — so
   * anything pinned to a far edge, or spanning between two, had to be
   * built by a caller that had already measured the node. An
   * application that declares its own geometry, as a spreadsheet
   * declares its row height, does not need this; a general modifier
   * such as `borders()` cannot exist without it.
   *
   * Given all three on one axis, the size wins and the far inset is
   * ignored, which is the rule CSS settles the same conflict with.
   */
  readonly right?: number;
  readonly bottom?: number;
  /**
   * Grows the rectangle on all four sides. This is what puts a focus
   * ring outside the control instead of on top of it.
   */
  readonly outset?: number;
  /**
   * Corner radius. Omitted means the node's own radius grown by the
   * outset, so a ring around a rounded button is concentric with it
   * without the modifier having to read the node's radius.
   */
  readonly radius?: number;
  /**
   * Paints after the node's children and its own text instead of
   * before them. Both phases are outside the node's own clip; this
   * chooses which side of the content the decoration lands on.
   */
  readonly after?: 'children';
}

export interface DecorationFill extends DecorationBox {
  readonly kind: 'fill';
  /** A `UiColor`, a hex or named CSS colour, or a palette name. */
  readonly color: UiColorValue;
}

export interface DecorationStroke extends DecorationBox {
  readonly kind: 'stroke';
  readonly color: UiColorValue;
  /**
   * The band lies *inside* the rectangle, as a border does and as an
   * overlay stroke does, so `outset: 3, lineWidth: 2` puts the ring
   * between one and three pixels outside the node's box.
   */
  readonly lineWidth: number;
}

/** A decoration's rectangle in the absolute coordinates a record uses. */
export interface DecorationRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * Places a decoration against the node's record.
 *
 * Shared by both backends rather than derived twice: the offsets, the
 * outset and the inherited radius are exactly the arithmetic the two
 * renderers would otherwise drift on.
 */
export function decorationRect(shape: DecorationShape, rec: LayoutRecord, nodeRadius: number): DecorationRect {
  const outset = shape.outset ?? 0;
  const horizontal = axis(rec.x, rec.width, shape.x, shape.width, shape.right, outset);
  const vertical = axis(rec.y, rec.height, shape.y, shape.height, shape.bottom, outset);
  const radius = Math.max(0, shape.radius ?? nodeRadius + outset);
  return {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.size,
    height: vertical.size,
    radius
  };
}

/**
 * One axis of the placement, from any two of near, size and far.
 *
 * The outset applies after the three are reconciled, growing the
 * rectangle by it on both sides, so it means the same thing however
 * the rectangle was described.
 */
function axis(
  origin: number,
  extent: number,
  near: number | undefined,
  size: number | undefined,
  far: number | undefined,
  outset: number
): { start: number; size: number } {
  let start: number;
  let length: number;
  if (near === undefined && size !== undefined && far !== undefined) {
    // Pinned to the far edge at a fixed size: the only case where the
    // near edge is the one that has to be worked out.
    length = size;
    start = extent - far - size;
  } else {
    start = near ?? 0;
    length = size ?? extent - start - (far ?? 0);
  }
  return { start: origin + start - outset, size: Math.max(0, length + 2 * outset) };
}

/**
 * A decoration's colour, resolved against the node it decorates.
 *
 * The same rule every colour prop follows: a palette name resolves
 * against whatever theme the node inherits, at paint. That is why
 * `focusRing()` never reads the theme — it names `focusRing` and the
 * node's environment decides what that is, so a ring inside a dark
 * card is the dark palette's without the modifier knowing there was a
 * card.
 */
export function decorationColor(node: UiNode, shape: DecorationShape): UiColor | undefined {
  return resolveColorValue(node, shape.color);
}

/** Whether a shape paints before the node's children or after them. */
export function paintsAfterChildren(shape: DecorationShape): boolean {
  return shape.after === 'children';
}

/** Whether any shape in the list paints in the given phase; lets a renderer skip a pass. */
export function hasDecorationPhase(shapes: readonly DecorationShape[], after: boolean): boolean {
  for (const shape of shapes) {
    if (paintsAfterChildren(shape) === after) {
      return true;
    }
  }
  return false;
}

import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import type { LayoutRecord } from '../layout/LayoutRecord';
import { createPaintState, isPaintVisible, resolvePaintState } from './PaintState';
import type { PaintState } from './PaintState';
import { decorationRect } from './Decorations';
import { snapScroll } from './ScrollSnap';
import { parseTransform, type UiTransform } from '../properties/UiTransform';

/**
 * Group opacity: `opacity` composites a node and its subtree as one
 * picture, as CSS does.
 *
 * A node at half opacity with a blue background and a white label is
 * a faded button whose label is as white as the button is faded: the
 * subtree is drawn opaque, then blended once. Multiplying the opacity
 * into each draw instead fades the label twice, once in its own draw
 * and again through the half-transparent background it lands on, and
 * a disabled button's label came out (202,207,213) over a white page
 * where CSS and Figma give (255,255,255).
 *
 * The two only agree when nothing in the subtree overlaps anything
 * else in it, and the one case that is cheap to know is the one that
 * matters: everything the subtree paints is a single draw. A faded
 * icon, a faded line of text, a fading box. That keeps multiplying,
 * which costs nothing; everything else gets a layer — an offscreen
 * canvas in Canvas2D, a render pass into a texture in WebGPU — and the
 * layer is blended at the opacity. The rule is shared so the two
 * backends agree on which nodes get one.
 */

/** A second scratch, so probing a child never overwrites the walk's. */
const probe = createPaintState();

/** Whether a node at `opacity < 1` must be drawn into a layer and blended once. */
export function opacityNeedsLayer(
  node: UiNode,
  rec: LayoutRecord,
  paint: PaintState,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined }
): boolean {
  return !paintsOnce(node, rec, paint, layout);
}

/**
 * Whether a subtree paints at most one draw, so that blending each draw
 * at the opacity is the same as blending the whole at it.
 *
 * Walks down a chain of nodes that paint nothing themselves and hold
 * one child each, the shape a wrapper takes, and stops at the first
 * node that paints or branches. Never longer than that chain.
 */
function paintsOnce(
  node: UiNode,
  rec: LayoutRecord,
  paint: PaintState,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined }
): boolean {
  const own = ownDraws(node, rec, paint);
  if (own > 1) {
    return false;
  }
  const child = onlyChild(node, layout);
  if (child === null) {
    return true;
  }
  if (child === undefined || own > 0) {
    return false;
  }
  const childRec = layout.recordFor(child)!;
  return !childRec.lifted && paintsOnce(child, childRec, resolvePaintState(child, probe), layout);
}

/**
 * The one child that may paint, null for none, undefined for more than
 * one. Through fragments, which have no box; skipping what is hidden.
 */
function onlyChild(
  node: UiNode,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined }
): UiNode | null | undefined {
  let found: UiNode | null = null;
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.type === UiNodeType.Fragment) {
      const inner = onlyChild(child, layout);
      if (inner === undefined || (inner !== null && found !== null)) {
        return undefined;
      }
      found = inner ?? found;
      continue;
    }
    if (layout.recordFor(child) === undefined || !isPaintVisible(child)) {
      continue;
    }
    if (found !== null) {
      return undefined;
    }
    found = child;
  }
  return found;
}

/**
 * How many draws a node makes of its own, counted only as far as two:
 * past one, the answer is already a layer.
 */
function ownDraws(node: UiNode, rec: LayoutRecord, paint: PaintState): number {
  let draws = paint.boxShadows.length;
  if (paint.backgroundColor !== undefined) {
    draws++;
  }
  if (paint.backgroundGradient !== undefined) {
    draws++;
  }
  if (paint.image !== undefined || paint.video !== undefined || node.type === UiNodeType.Paint) {
    draws++;
  }
  if (paint.borderWidth > 0 && paint.borderColor !== undefined) {
    draws++;
  }
  if (node.decorations !== null) {
    draws += node.decorations.length;
  }
  if (rec.scrollable || rec.textScrollbars) {
    draws++;
  }
  if (paint.editor !== undefined) {
    // A caret, a selection or a placeholder over the text.
    draws += 2;
  } else if (paint.text !== undefined && paint.text.length > 0) {
    // Lines of one paragraph do not overlap; a highlight, a run's
    // background or an underline lies over or under the glyphs.
    const plain =
      paint.textSelection === undefined &&
      paint.textMatches === undefined &&
      paint.spans === undefined &&
      paint.textDecoration === 'none';
    draws += plain ? 1 : 2;
  }
  return draws;
}

/**
 * How far past its device-pixel bounds a layer's region reaches: the
 * antialiased fringe of an edge, a scroll offset snapped to a device
 * pixel, and the ink of a glyph that overhangs its line box.
 */
const REGION_SLOP = 2;

/** A rectangle in device pixels. */
export interface DeviceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An affine matrix to device pixels, as `getTransform` reports one. */
export interface DeviceMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * The part of the surface an opacity group can paint, in whole device
 * pixels: where its layer is drawn and blended.
 *
 * Only that much, because a layer the size of the surface is what a
 * small faded button cannot afford. Blending one onto the frame costs a
 * copy of the whole layer in Chrome's Canvas2D, about a millisecond and
 * a half at 2400×1800 per group, while a layer the button's size costs
 * hundredths of one.
 *
 * Worked out before the subtree is drawn, from its records: every box
 * with its outer shadows, every decoration, through every transform,
 * sticky shift and scroll offset on the way down, cut to every clip on
 * the way down except for a lifted node, which escapes them. That is
 * where the backends draw, so nothing drawn lies outside it but text
 * overflowing its own box, which the region's slop does not cover past a
 * glyph's overhang; layout sizes a text node to its text, so that is a
 * box narrower than its words. `m` is the matrix the node is drawn
 * under, its own transform included. Clipped to the surface, and empty
 * when the group is entirely off it.
 */
export function layerRegion(
  node: UiNode,
  rec: LayoutRecord,
  m: DeviceMatrix,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined },
  surfaceWidth: number,
  surfaceHeight: number,
  dpr: number
): DeviceRect {
  bounds.minX = Infinity;
  bounds.minY = Infinity;
  bounds.maxX = -Infinity;
  bounds.maxY = -Infinity;
  includeSubtree(node, rec, [m.a, m.b, m.c, m.d, m.e, m.f], null, layout, dpr);
  const left = Math.max(0, Math.floor(bounds.minX) - REGION_SLOP);
  const top = Math.max(0, Math.floor(bounds.minY) - REGION_SLOP);
  const right = Math.min(surfaceWidth, Math.ceil(bounds.maxX) + REGION_SLOP);
  const bottom = Math.min(surfaceHeight, Math.ceil(bounds.maxY) + REGION_SLOP);
  if (right <= left || bottom <= top) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

type Matrix = [number, number, number, number, number, number];

/** What a region walk has covered so far; module scratch, as a walk is not re-entrant. */
const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

function includeSubtree(
  node: UiNode,
  rec: LayoutRecord,
  m: Matrix,
  clip: DeviceRect | null,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined },
  dpr: number
): void {
  includeRect(
    m,
    rec.x - rec.paintReachLeft,
    rec.y - rec.paintReachTop,
    rec.width + rec.paintReachLeft + rec.paintReachRight,
    rec.height + rec.paintReachTop + rec.paintReachBottom,
    clip
  );
  if (node.decorations !== null) {
    for (const shape of node.decorations) {
      const r = decorationRect(shape, rec, 0);
      // A stroke is centred on nothing past the rectangle, but its
      // width is the most it could reach either way.
      const reach = shape.kind === 'stroke' ? shape.lineWidth : 0;
      includeRect(m, r.x - reach, r.y - reach, r.width + reach * 2, r.height + reach * 2, clip);
    }
  }
  if (node.firstChild === null) {
    return;
  }
  const childClip = rec.clips ? intersect(clip, rectThrough(m, rec.x, rec.y, rec.width, rec.height)) : clip;
  const childMatrix = rec.scrollable
    ? multiply(m, [1, 0, 0, 1, -snapScroll(rec.scrollX, dpr), -snapScroll(rec.scrollY, dpr)])
    : m;
  includeChildren(node, childMatrix, childClip, layout, dpr);
}

function includeChildren(
  node: UiNode,
  m: Matrix,
  clip: DeviceRect | null,
  layout: { recordFor(node: UiNode): LayoutRecord | undefined },
  dpr: number
): void {
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.type === UiNodeType.Fragment) {
      includeChildren(child, m, clip, layout, dpr);
      continue;
    }
    const rec = layout.recordFor(child);
    if (rec === undefined || !isPaintVisible(child)) {
      continue;
    }
    let cm = m;
    if (rec.stickyOffsetX !== 0 || rec.stickyOffsetY !== 0) {
      cm = multiply(cm, [1, 0, 0, 1, rec.stickyOffsetX, rec.stickyOffsetY]);
    }
    const raw = child.properties.get('transform');
    const transform = raw === undefined ? undefined : parseTransform(raw);
    if (transform !== undefined) {
      cm = multiply(cm, ownTransform(rec, transform));
    }
    includeSubtree(child, rec, cm, rec.lifted ? null : clip, layout, dpr);
  }
}

/**
 * A node's own transform, as both backends apply it: translated, then
 * turned and scaled about its origin. See `UiTransform`.
 */
function ownTransform(rec: LayoutRecord, t: UiTransform): Matrix {
  const originX = rec.x + t.x;
  const originY = rec.y + t.y;
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const a = cos * t.scaleX;
  const b = sin * t.scaleX;
  const c = -sin * t.scaleY;
  const d = cos * t.scaleY;
  return [
    a,
    b,
    c,
    d,
    originX - originX * a - originY * c + t.translateX,
    originY - originX * b - originY * d + t.translateY
  ];
}

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

/** The device-pixel bounds of a rectangle through a matrix. */
function rectThrough(m: Matrix, x: number, y: number, width: number, height: number): DeviceRect {
  const x1 = x + width;
  const y1 = y + height;
  const ax = m[0] * x + m[2] * y + m[4];
  const ay = m[1] * x + m[3] * y + m[5];
  const bx = m[0] * x1 + m[2] * y + m[4];
  const by = m[1] * x1 + m[3] * y + m[5];
  const cx = m[0] * x + m[2] * y1 + m[4];
  const cy = m[1] * x + m[3] * y1 + m[5];
  const dx = m[0] * x1 + m[2] * y1 + m[4];
  const dy = m[1] * x1 + m[3] * y1 + m[5];
  const left = Math.min(ax, bx, cx, dx);
  const top = Math.min(ay, by, cy, dy);
  return { x: left, y: top, width: Math.max(ax, bx, cx, dx) - left, height: Math.max(ay, by, cy, dy) - top };
}

function intersect(a: DeviceRect | null, b: DeviceRect): DeviceRect {
  if (a === null) {
    return b;
  }
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function includeRect(m: Matrix, x: number, y: number, width: number, height: number, clip: DeviceRect | null): void {
  const r = clip === null ? rectThrough(m, x, y, width, height) : intersect(clip, rectThrough(m, x, y, width, height));
  if (r.width <= 0 || r.height <= 0) {
    return;
  }
  bounds.minX = Math.min(bounds.minX, r.x);
  bounds.minY = Math.min(bounds.minY, r.y);
  bounds.maxX = Math.max(bounds.maxX, r.x + r.width);
  bounds.maxY = Math.max(bounds.maxY, r.y + r.height);
}

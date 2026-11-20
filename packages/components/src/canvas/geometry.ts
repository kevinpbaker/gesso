/**
 * The arithmetic of a canvas editor, apart from any canvas: the eight
 * handles of a box and what dragging one does, snapping a move or a
 * point to what is near it, and the words a readout says.
 *
 * Every function here is pure and in the editor's own coordinates
 * (logical pixels in the canvas node, y down), so an application that
 * keeps its own pointer handling can still use them: Calcwright's
 * drawing tools snap with `snapPoint` and its readout says what
 * `readoutText` says.
 */

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The eight handles of a box, by compass point: corners and side middles. */
export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const BOX_HANDLES: readonly BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Where each of a box's handles is. */
export function boxHandlePoint(rect: CanvasRect, handle: BoxHandle): CanvasPoint {
  const [fx, fy] = HANDLE_FRACTIONS[handle];
  return { x: rect.x + rect.width * fx, y: rect.y + rect.height * fy };
}

const HANDLE_FRACTIONS: Record<BoxHandle, readonly [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5]
};

/** The cursor that says which way a handle drags. */
export function boxHandleCursor(handle: BoxHandle): 'nwse-resize' | 'nesw-resize' | 'ns-resize' | 'ew-resize' {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    default:
      return 'ew-resize';
  }
}

/**
 * The box after dragging one of its handles by `dx`, `dy`. A side
 * handle moves that side only; a corner moves its two sides. `keepAspect`
 * (Shift, on a corner) keeps the box's proportions, following whichever
 * side moved further. A box dragged past its opposite side turns over
 * rather than going negative: the width and height are never below zero.
 */
export function resizeRect(
  rect: CanvasRect,
  handle: BoxHandle,
  dx: number,
  dy: number,
  keepAspect = false
): CanvasRect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  const west = handle === 'nw' || handle === 'w' || handle === 'sw';
  const east = handle === 'ne' || handle === 'e' || handle === 'se';
  const north = handle === 'nw' || handle === 'n' || handle === 'ne';
  const south = handle === 'sw' || handle === 's' || handle === 'se';
  if (keepAspect && (west || east) && (north || south) && rect.width > 0 && rect.height > 0) {
    const ratio = rect.width / rect.height;
    const sx = (east ? dx : -dx) / rect.width;
    const sy = (south ? dy : -dy) / rect.height;
    const s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
    const width = rect.width * (1 + s);
    const height = width / ratio;
    dx = east ? width - rect.width : rect.width - width;
    dy = south ? height - rect.height : rect.height - height;
  }
  if (west) left += dx;
  if (east) right += dx;
  if (north) top += dy;
  if (south) bottom += dy;
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top)
  };
}

/** The smallest box round all of `rects`, or null for none. */
export function unionRect(rects: readonly CanvasRect[]): CanvasRect | null {
  if (rects.length === 0) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.x);
    top = Math.min(top, r.y);
    right = Math.max(right, r.x + r.width);
    bottom = Math.max(bottom, r.y + r.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The box two points span, whichever way round. */
export function rectFrom(a: CanvasPoint, b: CanvasPoint): CanvasRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function rectsTouch(a: CanvasRect, b: CanvasRect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

export function rectContains(outer: CanvasRect, inner: CanvasRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function pointInRect(p: CanvasPoint, r: CanvasRect, slack = 0): boolean {
  return p.x >= r.x - slack && p.x <= r.x + r.width + slack && p.y >= r.y - slack && p.y <= r.y + r.height + slack;
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

/** A line drawn across the canvas where something lined up: `x` is upright, `y` level. */
export interface SnapGuide {
  readonly axis: 'x' | 'y';
  readonly at: number;
}

/**
 * Where a point or a move snapped, and why: `point` is where the mark
 * goes, `kind` what it snapped to (`'end'`, `'centre'`, `'edge'`,
 * `'grid'`, or an application's own, `'tangent'`), and `guides` the lines
 * that show what lined up.
 */
export interface SnapHit {
  readonly point: CanvasPoint;
  readonly kind: string;
  readonly guides: readonly SnapGuide[];
}

/** A point another can snap to, and what kind of point it is. */
export interface SnapTarget extends CanvasPoint {
  readonly kind?: string;
}

/**
 * The snapped place of a point: the nearest target within `reach`,
 * else the point lined up with targets on either axis (a guide each),
 * else the grid, else the point as it was (`hit` null).
 */
export function snapPoint(
  p: CanvasPoint,
  targets: readonly SnapTarget[],
  options: { readonly reach: number; readonly grid?: number }
): { point: CanvasPoint; hit: SnapHit | null } {
  let best: SnapTarget | null = null;
  let bestDistance = options.reach;
  for (const target of targets) {
    const distance = Math.hypot(target.x - p.x, target.y - p.y);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  if (best !== null) {
    const point = { x: best.x, y: best.y };
    return { point, hit: { point, kind: best.kind ?? 'point', guides: [] } };
  }
  const lineX = nearestOn(
    p.x,
    targets.map(t => t.x),
    options.reach
  );
  const lineY = nearestOn(
    p.y,
    targets.map(t => t.y),
    options.reach
  );
  if (lineX !== null || lineY !== null) {
    const point = {
      x: lineX ?? onGrid(p.x, options.grid),
      y: lineY ?? onGrid(p.y, options.grid)
    };
    const guides: SnapGuide[] = [];
    if (lineX !== null) guides.push({ axis: 'x', at: lineX });
    if (lineY !== null) guides.push({ axis: 'y', at: lineY });
    return { point, hit: { point, kind: 'aligned', guides } };
  }
  if (options.grid !== undefined && options.grid > 0) {
    const point = { x: onGrid(p.x, options.grid), y: onGrid(p.y, options.grid) };
    return { point, hit: { point, kind: 'grid', guides: [] } };
  }
  return { point: p, hit: null };
}

/**
 * How far to shift a moving box so it lines up with others: its left,
 * centre and right against theirs, and its top, middle and bottom. Each
 * axis snaps on its own, within `reach`; what lined up comes back as
 * guides. Points (`moving` and `targets` points) are tried first: a
 * corner dropped on a corner is the snap a drawing wants most.
 */
export function snapMove(
  box: CanvasRect,
  others: readonly CanvasRect[],
  options: {
    readonly reach: number;
    readonly grid?: number;
    readonly points?: readonly SnapTarget[];
    readonly targets?: readonly SnapTarget[];
  }
): { dx: number; dy: number; hit: SnapHit | null } {
  const points = options.points ?? [];
  const targets = options.targets ?? [];
  let pointBest: { dx: number; dy: number; at: SnapTarget; d: number } | null = null;
  for (const p of points) {
    for (const t of targets) {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d <= options.reach && (pointBest === null || d < pointBest.d)) {
        pointBest = { dx: t.x - p.x, dy: t.y - p.y, at: t, d };
      }
    }
  }
  if (pointBest !== null) {
    const point = { x: pointBest.at.x, y: pointBest.at.y };
    return { dx: pointBest.dx, dy: pointBest.dy, hit: { point, kind: pointBest.at.kind ?? 'point', guides: [] } };
  }
  const xs = [box.x, box.x + box.width / 2, box.x + box.width];
  const ys = [box.y, box.y + box.height / 2, box.y + box.height];
  const ox: number[] = [];
  const oy: number[] = [];
  for (const o of others) {
    ox.push(o.x, o.x + o.width / 2, o.x + o.width);
    oy.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  const sx = bestShift(xs, ox, options.reach);
  const sy = bestShift(ys, oy, options.reach);
  const guides: SnapGuide[] = [];
  let dx = 0;
  let dy = 0;
  if (sx !== null) {
    dx = sx.shift;
    guides.push({ axis: 'x', at: sx.at });
  } else if (options.grid !== undefined && options.grid > 0) {
    dx = onGrid(box.x, options.grid) - box.x;
  }
  if (sy !== null) {
    dy = sy.shift;
    guides.push({ axis: 'y', at: sy.at });
  } else if (options.grid !== undefined && options.grid > 0) {
    dy = onGrid(box.y, options.grid) - box.y;
  }
  if (guides.length === 0) {
    const gridded = options.grid !== undefined && options.grid > 0;
    return { dx, dy, hit: gridded ? { point: { x: box.x + dx, y: box.y + dy }, kind: 'grid', guides } : null };
  }
  const point = { x: sx?.at ?? box.x + dx, y: sy?.at ?? box.y + dy };
  return { dx, dy, hit: { point, kind: 'edge', guides } };
}

/** A point held to the nearest `step` degrees round `from`, at the distance it was: Shift on a line. */
export function holdAngle(from: CanvasPoint, to: CanvasPoint, step = 45): CanvasPoint {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) {
    return to;
  }
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const unit = (step * Math.PI) / 180;
  const held = Math.round(angle / unit) * unit;
  return { x: from.x + length * Math.cos(held), y: from.y + length * Math.sin(held) };
}

function onGrid(value: number, grid: number | undefined): number {
  return grid === undefined || grid <= 0 ? value : Math.round(value / grid) * grid;
}

function nearestOn(value: number, candidates: readonly number[], reach: number): number | null {
  let best: number | null = null;
  let distance = reach;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d <= distance) {
      best = c;
      distance = d;
    }
  }
  return best;
}

function bestShift(
  mine: readonly number[],
  theirs: readonly number[],
  reach: number
): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null;
  for (const m of mine) {
    for (const t of theirs) {
      const shift = t - m;
      if (Math.abs(shift) <= reach && (best === null || Math.abs(shift) < Math.abs(best.shift))) {
        best = { shift, at: t };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

/** A number as a readout says it: about three significant figures, a true minus sign. */
export function readoutNumber(n: number): string {
  if (!Number.isFinite(n)) {
    return '';
  }
  const abs = Math.abs(n);
  const places = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const text = String(Number(n.toFixed(places)));
  return text.startsWith('-') ? `−${text.slice(1)}` : text;
}

/**
 * What the readout beside the pointer says for a gesture, in the
 * canvas's pixels or, given `scale` (pixels per unit) and `unit`, in the
 * application's units: a length and an angle for a line, a width and a
 * height for a box, a distance for a move.
 */
export function readoutText(
  kind: 'length' | 'box' | 'move',
  from: CanvasPoint,
  to: CanvasPoint,
  options: { readonly scale?: number; readonly unit?: string; readonly yUp?: boolean } = {}
): string {
  const scale = options.scale ?? 1;
  const unit = options.unit === undefined || options.unit === '' ? '' : ` ${options.unit}`;
  const dx = (to.x - from.x) / scale;
  const dy = ((to.y - from.y) / scale) * (options.yUp === true ? -1 : 1);
  switch (kind) {
    case 'length': {
      const angle = (Math.atan2(options.yUp === true ? dy : -dy, dx) * 180) / Math.PI;
      return `${readoutNumber(Math.hypot(dx, dy))}${unit} at ${readoutNumber(Math.round(angle))}°`;
    }
    case 'box':
      return `${readoutNumber(Math.abs(dx))} × ${readoutNumber(Math.abs(dy))}${unit}`;
    default:
      return `Δx ${readoutNumber(dx)}  Δy ${readoutNumber(dy)}${unit}`;
  }
}

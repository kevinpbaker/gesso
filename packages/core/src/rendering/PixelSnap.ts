/**
 * Box edges and border widths on whole device pixels, as a browser
 * paints them.
 *
 * Layout keeps fractions, and must: a flex row split three ways, or a
 * box at 10.4px, is what Chrome's layout says too, and the conformance
 * fixtures hold the engine to it. Chrome then snaps what it paints. A
 * background's edges go to the nearest device pixel and a border's
 * width rounds down to whole device pixels, never below one. Painted
 * where layout put them instead, a 1px border at 1.5x covers two
 * half-strength pixels, a box at 10.4 has a soft edge, and two boxes
 * that meet at 10.4 leave a faint seam where each paints its edge
 * pixel at partial coverage.
 *
 * Both renderers snap through these functions, so they snap the same
 * pixels, and only while the transform is a pure translation at the
 * device ratio. Under a node's own scale or rotation a box is left
 * where it is: Chrome does not snap inside a transform either, and
 * snapping a box that is animating its scale would make its edges jump
 * a pixel at a time.
 */

/** A box in layout coordinates; the result is written into one of these. */
export interface SnapBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Writes `box` snapped into `out`, given where layout coordinates land
 * in device pixels: `device = layout × scale + offset` on each axis.
 * Each edge goes to its nearest device pixel independently, so two
 * boxes that share an edge in layout share it in pixels too. `out` may
 * carry more than a box (a decoration's corners); only the four numbers
 * are written.
 */
export function snapBox<T extends SnapBox>(
  box: Readonly<SnapBox>,
  scale: number,
  offsetX: number,
  offsetY: number,
  out: T
): T {
  const left = Math.round(box.x * scale + offsetX);
  const right = Math.round((box.x + box.width) * scale + offsetX);
  const top = Math.round(box.y * scale + offsetY);
  const bottom = Math.round((box.y + box.height) * scale + offsetY);
  out.x = (left - offsetX) / scale;
  out.y = (top - offsetY) / scale;
  out.width = (right - left) / scale;
  out.height = (bottom - top) / scale;
  return out;
}

/**
 * A border's width in whole device pixels: rounded down, and never
 * below one for a border that has any width, which is Chrome's rule.
 */
export function snapBorderWidth(width: number, scale: number): number {
  if (width <= 0) {
    return 0;
  }
  return Math.max(1, Math.floor(width * scale + 1e-6)) / scale;
}

/**
 * Whether a 2D matrix maps layout to device pixels by translation and
 * the device ratio alone, which is when snapping is safe.
 */
export function snapsUnder(a: number, b: number, c: number, d: number, dpr: number): boolean {
  return b === 0 && c === 0 && Math.abs(a - dpr) < 1e-9 && Math.abs(d - dpr) < 1e-9;
}

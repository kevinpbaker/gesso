/**
 * A scroll offset as it is drawn: on a whole device pixel.
 *
 * The offset a container holds stays exact, so a trackpad's steps of a
 * fraction of a pixel still add up; only what is drawn lands on the
 * pixel grid, as a browser draws scrolled content. Drawn at the exact
 * offset, text lands between pixels and rasterises differently each
 * frame, which shimmers as a flick coasts to a stop.
 */
export function snapScroll(offset: number, dpr: number): number {
  return Math.round(offset * dpr) / dpr;
}

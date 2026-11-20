import { paintTextMetrics, type PaintSurface, type UiColorValue } from 'gesso-core';

import { BOX_HANDLES, boxHandlePoint, unionRect, type CanvasPoint, type CanvasRect, type SnapGuide } from './geometry';

/**
 * What a canvas editor draws over the content: the outline under the
 * pointer, the chosen shapes and their handles, the marquee, the
 * guides and the snap mark, and the readout beside the pointer. All of
 * it in the editor's own coordinates, and drawn the same size on screen
 * whatever the zoom: `scale` is screen pixels per canvas pixel.
 */
export interface CanvasOverlayState {
  readonly hovered: CanvasRect | null;
  /** Each chosen shape's box. */
  readonly selected: readonly CanvasRect[];
  /** The box the eight handles are on, or null for none. */
  readonly box: CanvasRect | null;
  /** Handles of a shape's own, as a line's two ends, where it has no box. */
  readonly points: readonly CanvasPoint[];
  readonly marquee: CanvasRect | null;
  readonly guides: readonly SnapGuide[];
  readonly snap: CanvasPoint | null;
  readonly readout: { readonly text: string; readonly at: CanvasPoint } | null;
  /**
   * What the snap is, in small type beside the point it snapped to:
   * `center`, `tangent`, `grid`. Placed clear of the readout.
   */
  readonly snapLabel?: { readonly text: string; readonly at: CanvasPoint } | null;
}

export const EMPTY_OVERLAY: CanvasOverlayState = {
  hovered: null,
  selected: [],
  box: null,
  points: [],
  marquee: null,
  guides: [],
  snap: null,
  readout: null,
  snapLabel: null
};

export interface CanvasOverlayColors {
  /** The chosen shapes, their handles' rims, the marquee. Default `primary`. */
  readonly selection?: UiColorValue;
  /** The hover outline. Default the selection's colour. */
  readonly hover?: UiColorValue;
  /** The guides and the snap mark. Default `danger`, which stands out from the selection. */
  readonly guide?: UiColorValue;
  /** The handles' fill. Default `background`. */
  readonly handle?: UiColorValue;
  /** The readout's plate. Default `text`, so it stands out from what it is over. */
  readonly readout?: UiColorValue;
  /** The readout's words. Default `background`. */
  readonly readoutText?: UiColorValue;
  /** The readout's font family, as `PaintTextStyle.fontFamily` names one. Default the theme's. */
  readonly readoutFont?: string;
}

/** The side of a handle, on screen. */
export const HANDLE_SIZE = 7;

export function paintCanvasOverlay(
  surface: PaintSurface,
  state: CanvasOverlayState,
  size: { readonly width: number; readonly height: number },
  scale = 1,
  colors: CanvasOverlayColors = {}
): void {
  const px = 1 / (scale > 0 ? scale : 1);
  const selection = colors.selection ?? 'primary';
  const guide = colors.guide ?? 'danger';
  surface.save();
  surface.lineWidth(px);

  if (state.hovered !== null) {
    surface.strokeColor(colors.hover ?? selection);
    surface.beginPath();
    surface.rect(
      state.hovered.x - 2 * px,
      state.hovered.y - 2 * px,
      state.hovered.width + 4 * px,
      state.hovered.height + 4 * px
    );
    surface.stroke();
  }

  if (state.selected.length > 0) {
    surface.strokeColor(selection);
    surface.alpha(state.selected.length > 1 ? 0.6 : 1);
    for (const r of state.selected) {
      surface.beginPath();
      surface.rect(r.x, r.y, r.width, r.height);
      surface.stroke();
    }
    surface.alpha(1);
  }

  // Several chosen: one dashed box round all of them, with or without handles.
  const all = state.selected.length > 1 ? unionRect(state.selected) : null;
  if (all !== null) {
    surface.strokeColor(selection);
    surface.lineDash([4 * px, 3 * px]);
    surface.beginPath();
    surface.rect(all.x, all.y, all.width, all.height);
    surface.stroke();
    surface.lineDash([]);
  }
  if (state.box !== null) {
    const box = state.box;
    for (const handle of BOX_HANDLES) {
      handleSquare(surface, boxHandlePoint(box, handle), px, selection, colors.handle);
    }
  }
  for (const point of state.points) {
    handleSquare(surface, point, px, selection, colors.handle);
  }

  if (state.marquee !== null) {
    const m = state.marquee;
    surface.fillColor(selection);
    surface.alpha(0.08);
    surface.beginPath();
    surface.rect(m.x, m.y, m.width, m.height);
    surface.fill();
    surface.alpha(1);
    surface.strokeColor(selection);
    surface.lineDash([4 * px, 3 * px]);
    surface.stroke();
    surface.lineDash([]);
  }

  if (state.guides.length > 0) {
    surface.strokeColor(guide);
    surface.lineDash([2 * px, 3 * px]);
    surface.beginPath();
    for (const g of state.guides) {
      if (g.axis === 'x') {
        surface.moveTo(g.at, 0);
        surface.lineTo(g.at, size.height);
      } else {
        surface.moveTo(0, g.at);
        surface.lineTo(size.width, g.at);
      }
    }
    surface.stroke();
    surface.lineDash([]);
  }

  if (state.snap !== null) {
    const s = 5 * px;
    surface.strokeColor(guide);
    surface.lineWidth(1.5 * px);
    surface.beginPath();
    surface.rect(state.snap.x - s, state.snap.y - s, 2 * s, 2 * s);
    surface.stroke();
    surface.lineWidth(px);
  }

  const readout =
    state.readout === null ? null : readoutPlate(state.readout.text, state.readout.at, size, scale, colors.readoutFont);
  if (state.snapLabel !== undefined && state.snapLabel !== null && state.snapLabel.text.length > 0) {
    paintSnapLabel(surface, state.snapLabel.text, state.snapLabel.at, readout, size, scale, colors);
  }
  if (state.readout !== null) {
    paintReadout(surface, state.readout.text, state.readout.at, size, scale, colors);
  }
  surface.restore();
}

interface Plate {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The words beside a snap mark: small type on a plate of the handles'
 * fill, in the guide colour. It goes at the place nearest the point
 * that is inside the canvas and clear of the readout: one of the
 * point's four diagonals, or against the readout's edges where the
 * readout has turned over in a corner. The readout sits below right of
 * the pointer, which is within reach of the point, so above right is
 * nearly always where it goes.
 */
function paintSnapLabel(
  surface: PaintSurface,
  text: string,
  at: CanvasPoint,
  readout: Plate | null,
  size: { readonly width: number; readonly height: number },
  scale: number,
  colors: CanvasOverlayColors
): void {
  const px = 1 / (scale > 0 ? scale : 1);
  const style = { fontSize: 10 * px, fontWeight: 500, fontFamily: colors.readoutFont };
  const metrics = paintTextMetrics(text, style);
  const padX = 3 * px;
  const padY = 1 * px;
  const width = metrics.width + 2 * padX;
  const height = metrics.ascent + metrics.descent + 2 * padY;
  const gap = 8 * px;
  const places: Plate[] = [
    { x: at.x + gap, y: at.y - gap - height, width, height },
    { x: at.x - gap - width, y: at.y - gap - height, width, height },
    { x: at.x - gap - width, y: at.y + gap, width, height },
    { x: at.x + gap, y: at.y + gap, width, height }
  ];
  const margin = 2 * px;
  const inside = (p: Plate) =>
    p.x >= margin && p.y >= margin && p.x + p.width <= size.width - margin && p.y + p.height <= size.height - margin;
  const clear = (p: Plate) =>
    readout === null ||
    !(
      p.x < readout.x + readout.width + margin &&
      readout.x < p.x + p.width + margin &&
      p.y < readout.y + readout.height + margin &&
      readout.y < p.y + p.height + margin
    );
  if (readout !== null) {
    // In a corner, where the readout has turned over onto the point's
    // other sides: against the readout's own edges instead.
    const above = readout.y - margin - height;
    const below = readout.y + readout.height + margin;
    const left = readout.x - margin - width;
    const right = readout.x + readout.width + margin;
    const flushLeft = readout.x;
    const flushRight = readout.x + readout.width - width;
    const flushTop = readout.y;
    const flushBottom = readout.y + readout.height - height;
    for (const [x, y] of [
      [flushLeft, above],
      [flushRight, above],
      [flushLeft, below],
      [flushRight, below],
      [left, flushTop],
      [left, flushBottom],
      [right, flushTop],
      [right, flushBottom]
    ]) {
      places.push({ x, y, width, height });
    }
  }
  const far = (p: Plate) =>
    Math.hypot(Math.max(p.x - at.x, at.x - (p.x + p.width), 0), Math.max(p.y - at.y, at.y - (p.y + p.height), 0));
  const fits = places.filter(p => inside(p) && clear(p));
  const place =
    fits.length > 0 ? fits.reduce((best, p) => (far(p) < far(best) ? p : best)) : (places.find(clear) ?? places[0]);
  surface.save();
  surface.fillColor(colors.handle ?? 'background');
  surface.alpha(0.85);
  surface.beginPath();
  surface.roundRect(place.x, place.y, place.width, place.height, 2 * px);
  surface.fill();
  surface.alpha(1);
  surface.fillColor(colors.guide ?? 'danger');
  surface.text(text, place.x + padX, place.y + padY + metrics.ascent, style);
  surface.restore();
}

/** Where `paintReadout` puts its plate, and the text's measures. */
function readoutPlate(
  text: string,
  at: CanvasPoint,
  size: { readonly width: number; readonly height: number },
  scale: number,
  font: string | undefined
): (Plate & { readonly ascent: number; readonly padX: number; readonly padY: number }) | null {
  if (text.length === 0) {
    return null;
  }
  const px = 1 / (scale > 0 ? scale : 1);
  const metrics = paintTextMetrics(text, { fontSize: 11 * px, fontWeight: 500, fontFamily: font });
  const padX = 6 * px;
  const padY = 3 * px;
  const width = metrics.width + 2 * padX;
  const height = metrics.ascent + metrics.descent + 2 * padY;
  const gap = 14 * px;
  let x = at.x + gap;
  let y = at.y + gap;
  if (x + width > size.width - 2 * px) x = at.x - gap - width;
  if (y + height > size.height - 2 * px) y = at.y - gap - height;
  x = Math.max(2 * px, x);
  y = Math.max(2 * px, y);
  return { x, y, width, height, ascent: metrics.ascent, padX, padY };
}

function handleSquare(
  surface: PaintSurface,
  at: CanvasPoint,
  px: number,
  rim: UiColorValue,
  fill: UiColorValue | undefined
): void {
  const half = (HANDLE_SIZE / 2) * px;
  surface.beginPath();
  surface.rect(at.x - half, at.y - half, 2 * half, 2 * half);
  surface.fillColor(fill ?? 'background');
  surface.fill();
  surface.strokeColor(rim);
  surface.stroke();
}

/**
 * The pill beside the pointer that says how long, how big or how far:
 * text on a dark plate measured to fit it, 14 px right of and below the
 * pointer, and kept inside `size` (the canvas), flipping to the left of
 * and above the pointer where there is no room right or below.
 */
export function paintReadout(
  surface: PaintSurface,
  text: string,
  at: CanvasPoint,
  size: { readonly width: number; readonly height: number },
  scale = 1,
  look: Pick<CanvasOverlayColors, 'readout' | 'readoutText' | 'readoutFont'> = {}
): void {
  const plate = readoutPlate(text, at, size, scale, look.readoutFont);
  if (plate === null) {
    return;
  }
  const px = 1 / (scale > 0 ? scale : 1);
  const style = { fontSize: 11 * px, fontWeight: 500, fontFamily: look.readoutFont };
  surface.save();
  surface.fillColor(look.readout ?? 'text');
  surface.alpha(0.88);
  surface.beginPath();
  surface.roundRect(plate.x, plate.y, plate.width, plate.height, 4 * px);
  surface.fill();
  surface.alpha(1);
  surface.fillColor(look.readoutText ?? 'background');
  surface.text(text, plate.x + plate.padX, plate.y + plate.padY + plate.ascent, style);
  surface.restore();
}

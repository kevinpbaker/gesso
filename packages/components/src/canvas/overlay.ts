import { paintTextMetrics, type PaintSurface, type UiColorValue } from 'gesso-core';

import { BOX_HANDLES, boxHandlePoint, type CanvasPoint, type CanvasRect, type SnapGuide } from './geometry';

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
}

export const EMPTY_OVERLAY: CanvasOverlayState = {
  hovered: null,
  selected: [],
  box: null,
  points: [],
  marquee: null,
  guides: [],
  snap: null,
  readout: null
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

  if (state.box !== null) {
    const box = state.box;
    if (state.selected.length > 1) {
      surface.strokeColor(selection);
      surface.lineDash([4 * px, 3 * px]);
      surface.beginPath();
      surface.rect(box.x, box.y, box.width, box.height);
      surface.stroke();
      surface.lineDash([]);
    }
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

  if (state.readout !== null) {
    paintReadout(surface, state.readout.text, state.readout.at, size, scale);
  }
  surface.restore();
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
  scale = 1
): void {
  if (text.length === 0) {
    return;
  }
  const px = 1 / (scale > 0 ? scale : 1);
  const style = { fontSize: 11 * px, fontWeight: 500 };
  const metrics = paintTextMetrics(text, style);
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
  surface.save();
  surface.fillColor('text');
  surface.alpha(0.88);
  surface.beginPath();
  surface.roundRect(x, y, width, height, 4 * px);
  surface.fill();
  surface.alpha(1);
  surface.fillColor('background');
  surface.text(text, x + padX, y + padY + metrics.ascent, style);
  surface.restore();
}

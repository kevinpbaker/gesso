import type { LayoutRecord } from './LayoutRecord';
import type { LayoutBox } from './LayoutTypes';

/** Thickness of an overlay scrollbar thumb. */
export const SCROLLBAR_THICKNESS = 6;
/** Gap between the thumb and the container's edges. */
export const SCROLLBAR_INSET = 2;
/** Shortest thumb, so a long list still shows something to grab. */
export const SCROLLBAR_MIN_THUMB = 24;
/** Distance from the end edge within which the pointer reveals the bar. */
export const SCROLLBAR_HOVER_ZONE = 16;

export type ScrollbarAxis = 'x' | 'y';

/**
 * One scrollbar's geometry, in the container's record coordinates
 * (pre-scroll, like the record box): the thumb rectangle and the
 * numbers that map pointer travel back to scroll offset.
 */
export interface ScrollbarThumb {
  axis: ScrollbarAxis;
  thumb: LayoutBox;
  /** Length of the track the thumb moves in. */
  track: number;
  /** How far the thumb can travel: track minus thumb length. */
  travel: number;
  /** contentExtent minus viewport: the scroll offset at full travel. */
  maxScroll: number;
  /** The container's extent along the axis: one page. */
  viewport: number;
}

/**
 * The scrollbars a scroll container shows: one per axis whose content
 * overflows. Renderers draw exactly these rectangles and the hit
 * tester grabs them, so what is seen is what is dragged.
 */
export function scrollbarThumbs(rec: LayoutRecord): {
  vertical: ScrollbarThumb | null;
  horizontal: ScrollbarThumb | null;
} {
  return { vertical: thumbFor(rec, 'y'), horizontal: thumbFor(rec, 'x') };
}

export function scrollbarThumb(rec: LayoutRecord, axis: ScrollbarAxis): ScrollbarThumb | null {
  return thumbFor(rec, axis);
}

function thumbFor(rec: LayoutRecord, axis: ScrollbarAxis): ScrollbarThumb | null {
  const viewport = axis === 'y' ? rec.height : rec.width;
  const content = axis === 'y' ? rec.contentHeight : rec.contentWidth;
  if (!(content > viewport) || viewport <= 0) {
    return null;
  }
  const track = viewport - SCROLLBAR_INSET * 2;
  const length = Math.min(track, Math.max(SCROLLBAR_MIN_THUMB, (track * viewport) / content));
  const travel = Math.max(0, track - length);
  const maxScroll = content - viewport;
  const offset = axis === 'y' ? rec.scrollY : rec.scrollX;
  const along = SCROLLBAR_INSET + (maxScroll > 0 ? (travel * offset) / maxScroll : 0);
  const thumb: LayoutBox =
    axis === 'y'
      ? {
          x: rec.x + rec.width - SCROLLBAR_INSET - SCROLLBAR_THICKNESS,
          y: rec.y + along,
          width: SCROLLBAR_THICKNESS,
          height: length
        }
      : {
          x: rec.x + along,
          y: rec.y + rec.height - SCROLLBAR_INSET - SCROLLBAR_THICKNESS,
          width: length,
          height: SCROLLBAR_THICKNESS
        };
  return { axis, thumb, track, travel, maxScroll, viewport };
}

/**
 * Whether a point in the container's record space lies in the band
 * along the end edge where the bar lives (and where hovering reveals
 * it). Returns the axis, or null.
 */
export function scrollbarZoneAt(rec: LayoutRecord, x: number, y: number): ScrollbarAxis | null {
  const inside = x >= rec.x && x < rec.x + rec.width && y >= rec.y && y < rec.y + rec.height;
  if (!inside) {
    return null;
  }
  if (rec.contentHeight > rec.height && x >= rec.x + rec.width - SCROLLBAR_HOVER_ZONE) {
    return 'y';
  }
  if (rec.contentWidth > rec.width && y >= rec.y + rec.height - SCROLLBAR_HOVER_ZONE) {
    return 'x';
  }
  return null;
}

export function pointInBox(box: LayoutBox, x: number, y: number): boolean {
  return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
}

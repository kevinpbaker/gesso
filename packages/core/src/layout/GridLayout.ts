import { AlignContent } from './Alignment';
import type { UiTrackSize } from './UiLength';
import { isAutoLength, isFrLength, isMinMaxTrack, isPercentLength } from './UiLength';

/**
 * The grid algorithm, without nodes: placement into cells and track
 * sizing (a subset of CSS Grid §11). The layout engine feeds it items
 * and measurements and reads back track sizes and cell rectangles.
 *
 * Supported: explicit tracks of `px`, `percent`, `auto`, `fr` and
 * `minmax(min, max)`, implicit tracks sized by an auto track size,
 * sparse auto-placement in row or column flow, explicit placement by
 * 1-based line with spans, gaps, and track distribution (`start`,
 * `center`, `end`, `space-*`, `stretch`). Not supported: dense packing,
 * negative lines, named lines and areas, subgrid.
 */

export interface GridItemRequest<T> {
  item: T;
  /** 1-based start line, or undefined for auto-placement. */
  column: number | undefined;
  row: number | undefined;
  columnSpan: number;
  rowSpan: number;
}

export interface GridPlacement<T> {
  item: T;
  /** 0-based track indices; end is exclusive. */
  columnStart: number;
  columnEnd: number;
  rowStart: number;
  rowEnd: number;
}

export interface GridPlacementResult<T> {
  placements: GridPlacement<T>[];
  columnCount: number;
  rowCount: number;
}

/**
 * Places items into cells (CSS Grid §8.5, without dense packing).
 *
 * Items with both lines given go first, where they say. Items with only
 * the line on the flow's cross axis given are locked to that track and
 * take the first free run along the flow axis. Everything else follows
 * a cursor that only moves forward, wrapping when it reaches the end of
 * the explicit tracks on the cross axis and growing the grid along the
 * flow axis as needed.
 */
export function placeGridItems<T>(
  items: readonly GridItemRequest<T>[],
  explicitColumns: number,
  explicitRows: number,
  flow: 'row' | 'column'
): GridPlacementResult<T> {
  const occupied = new Set<string>();
  const placements: (GridPlacement<T> | null)[] = items.map(() => null);
  let columnCount = Math.max(explicitColumns, 1);
  let rowCount = Math.max(explicitRows, 1);

  const occupy = (p: GridPlacement<T>): void => {
    for (let c = p.columnStart; c < p.columnEnd; c++) {
      for (let r = p.rowStart; r < p.rowEnd; r++) {
        occupied.add(`${c},${r}`);
      }
    }
    columnCount = Math.max(columnCount, p.columnEnd);
    rowCount = Math.max(rowCount, p.rowEnd);
  };
  const fits = (c: number, r: number, cs: number, rs: number): boolean => {
    for (let x = c; x < c + cs; x++) {
      for (let y = r; y < r + rs; y++) {
        if (occupied.has(`${x},${y}`)) {
          return false;
        }
      }
    }
    return true;
  };

  // 1. Fully specified items.
  items.forEach((request, index) => {
    if (request.column !== undefined && request.row !== undefined) {
      const p: GridPlacement<T> = {
        item: request.item,
        columnStart: request.column - 1,
        columnEnd: request.column - 1 + request.columnSpan,
        rowStart: request.row - 1,
        rowEnd: request.row - 1 + request.rowSpan
      };
      placements[index] = p;
      occupy(p);
    }
  });

  // 2. Items locked on the cross axis of the flow.
  const rowFlow = flow === 'row';
  items.forEach((request, index) => {
    if (placements[index] !== null) {
      return;
    }
    const locked = rowFlow ? request.row : request.column;
    if (locked === undefined) {
      return;
    }
    const crossStart = locked - 1;
    const crossSpan = rowFlow ? request.rowSpan : request.columnSpan;
    const mainSpan = rowFlow ? request.columnSpan : request.rowSpan;
    let main = 0;
    for (;;) {
      const c = rowFlow ? main : crossStart;
      const r = rowFlow ? crossStart : main;
      if (fits(c, r, rowFlow ? mainSpan : crossSpan, rowFlow ? crossSpan : mainSpan)) {
        break;
      }
      main++;
    }
    const p: GridPlacement<T> = rowFlow
      ? {
          item: request.item,
          columnStart: main,
          columnEnd: main + mainSpan,
          rowStart: crossStart,
          rowEnd: crossStart + crossSpan
        }
      : {
          item: request.item,
          columnStart: crossStart,
          columnEnd: crossStart + crossSpan,
          rowStart: main,
          rowEnd: main + mainSpan
        };
    placements[index] = p;
    occupy(p);
  });

  // 3. Auto-placed items, with a forward-only cursor.
  const crossLimit = rowFlow ? columnCount : rowCount;
  let cursorMain = 0;
  let cursorCross = 0;
  items.forEach((request, index) => {
    if (placements[index] !== null) {
      return;
    }
    const crossSpan = rowFlow ? request.columnSpan : request.rowSpan;
    const mainSpan = rowFlow ? request.rowSpan : request.columnSpan;
    const lockedMain = rowFlow ? request.row : request.column;
    if (lockedMain !== undefined) {
      // Given on the flow axis only: start at that line, search across.
      const main = lockedMain - 1;
      if (main !== cursorMain) {
        cursorMain = main;
        cursorCross = 0;
      }
    }
    for (;;) {
      if (cursorCross + crossSpan > Math.max(crossLimit, crossSpan)) {
        cursorCross = 0;
        cursorMain++;
        continue;
      }
      const c = rowFlow ? cursorCross : cursorMain;
      const r = rowFlow ? cursorMain : cursorCross;
      if (fits(c, r, rowFlow ? crossSpan : mainSpan, rowFlow ? mainSpan : crossSpan)) {
        const p: GridPlacement<T> = rowFlow
          ? { item: request.item, columnStart: c, columnEnd: c + crossSpan, rowStart: r, rowEnd: r + mainSpan }
          : { item: request.item, columnStart: c, columnEnd: c + mainSpan, rowStart: r, rowEnd: r + crossSpan };
        placements[index] = p;
        occupy(p);
        cursorCross += crossSpan;
        break;
      }
      cursorCross++;
    }
  });

  return { placements: placements as GridPlacement<T>[], columnCount, rowCount };
}

// ---------------------------------------------------------------------------
// Track sizing
// ---------------------------------------------------------------------------

export interface GridTrack {
  /** Where the track starts along the axis, from the content-box start. */
  offset: number;
  size: number;
  /** Intrinsic minimum the track settled on before free space was added. */
  base: number;
}

/** An item's min-content and max-content size along the axis being sized. */
export interface GridContribution {
  min: number;
  max: number;
}

interface WorkTrack {
  base: number;
  limit: number;
  flex: number;
  intrinsicMin: boolean;
  intrinsicMax: boolean;
  /** Stretches when the container has spare space and distribution is stretch. */
  auto: boolean;
}

export interface GridTrackSizingInput {
  /** Track size per track, explicit ones followed by implicit ones. */
  sizes: readonly UiTrackSize[];
  /** Definite content-box extent on this axis, or undefined. */
  available: number | undefined;
  gap: number;
  distribution: AlignContent;
  /** Each item's span on this axis (0-based start, exclusive end) and its contribution. */
  items: readonly { start: number; end: number; contribution: GridContribution }[];
}

export interface GridTrackSizingResult {
  tracks: GridTrack[];
  /** Σ sizes + gaps: the content extent along the axis. */
  total: number;
  /** Σ intrinsic minimums + gaps: the axis's min-content size. */
  minTotal: number;
}

/**
 * Sizes the tracks of one axis (CSS Grid §11.5–11.8, simplified).
 *
 * 1. Initialise each track's base size and growth limit from its size.
 * 2. Resolve intrinsic sizes: items spanning only non-flexible tracks,
 *    smallest spans first, raise the bases of intrinsic-min tracks by
 *    their min-content and the limits of intrinsic-max tracks by their
 *    max-content, spread equally over the spanned tracks.
 * 3. Maximise: spare definite space grows bases toward their limits.
 * 4. Flexible tracks share what remains by their fr factors; without a
 *    definite size the fr is the largest an item or base demands.
 * 5. Stretch: with a definite size and `stretch` distribution, auto
 *    tracks share the leftover equally.
 * Offsets then follow the distribution (start, center, end, space-*).
 */
export function sizeGridTracks(input: GridTrackSizingInput): GridTrackSizingResult {
  const { sizes, available, gap, distribution, items } = input;
  const count = sizes.length;
  const tracks: WorkTrack[] = sizes.map(size => initialTrack(size, available));
  const gaps = gap * Math.max(0, count - 1);

  // 2. Intrinsic contributions, by span. Items spanning several tracks
  //    one of which is flexible contribute nothing here (their automatic
  //    minimum is zero, CSS Grid §6.6); the flexible step sizes them.
  const spanned = items
    .map(item => ({ ...item, span: item.end - item.start }))
    .filter(item => item.span === 1 || (item.span > 1 && !rangeHasFlex(tracks, item.start, item.end)))
    .sort((a, b) => a.span - b.span);
  for (const item of spanned) {
    distributeToTracks(tracks, item.start, item.end, item.contribution.min, gap, 'base');
    distributeToTracks(tracks, item.start, item.end, item.contribution.max, gap, 'limit');
  }
  for (const track of tracks) {
    if (!isFinite(track.limit)) {
      track.limit = track.base;
    }
    track.limit = Math.max(track.limit, track.base);
  }
  const minTotal = tracks.reduce((sum, track) => sum + track.base, 0) + gaps;

  // 3. Maximise: definite spare space grows bases toward limits; an
  //    indefinite size is a max-content constraint, so every track grows
  //    all the way (CSS Grid §11.6).
  if (available !== undefined) {
    const free = available - gaps - tracks.reduce((sum, track) => sum + track.base, 0);
    if (free > 0) {
      growTowardLimits(tracks, free);
    }
  } else {
    for (const track of tracks) {
      if (track.flex === 0) {
        track.base = track.limit;
      }
    }
  }

  // 4. Flexible tracks.
  const flexTracks = tracks.filter(track => track.flex > 0);
  if (flexTracks.length > 0) {
    let fr: number;
    if (available !== undefined) {
      fr = findFrSize(tracks, available - gaps);
    } else {
      fr = 0;
      for (const track of flexTracks) {
        fr = Math.max(fr, track.base / track.flex);
      }
      for (const item of items) {
        if (item.end > item.start && rangeAllFlex(tracks, item.start, item.end)) {
          let factors = 0;
          for (let i = item.start; i < item.end; i++) {
            factors += tracks[i].flex;
          }
          if (factors > 0) {
            fr = Math.max(fr, (item.contribution.max - gap * (item.end - item.start - 1)) / factors);
          }
        }
      }
    }
    for (const track of flexTracks) {
      track.base = Math.max(track.base, fr * track.flex);
      track.limit = track.base;
    }
  }

  // 5. Stretch auto tracks into leftover definite space.
  let total = tracks.reduce((sum, track) => sum + track.base, 0) + gaps;
  if (available !== undefined && distribution === AlignContent.Stretch) {
    const stretchable = tracks.filter(track => track.auto && track.flex === 0);
    const free = available - total;
    if (free > 0 && stretchable.length > 0) {
      for (const track of stretchable) {
        track.base += free / stretchable.length;
      }
      total = available;
    }
  }

  // Offsets by distribution.
  let leading = 0;
  let between = gap;
  if (available !== undefined && available > total && count > 0) {
    const free = available - total;
    switch (distribution) {
      case AlignContent.Center:
        leading = free / 2;
        break;
      case AlignContent.End:
        leading = free;
        break;
      case AlignContent.SpaceBetween:
        if (count > 1) {
          between = gap + free / (count - 1);
        }
        break;
      case AlignContent.SpaceAround: {
        const slot = free / count;
        leading = slot / 2;
        between = gap + slot;
        break;
      }
      case AlignContent.SpaceEvenly: {
        const slot = free / (count + 1);
        leading = slot;
        between = gap + slot;
        break;
      }
      default:
        break;
    }
  }
  const result: GridTrack[] = [];
  let cursor = leading;
  for (let i = 0; i < count; i++) {
    result.push({ offset: cursor, size: tracks[i].base, base: tracks[i].base });
    cursor += tracks[i].base + (i < count - 1 ? between : 0);
  }
  return { tracks: result, total, minTotal };
}

function initialTrack(size: UiTrackSize, available: number | undefined): WorkTrack {
  const track: WorkTrack = { base: 0, limit: Infinity, flex: 0, intrinsicMin: false, intrinsicMax: false, auto: false };
  if (typeof size === 'number') {
    track.base = size;
    track.limit = size;
    return track;
  }
  if (isPercentLength(size)) {
    if (available !== undefined) {
      track.base = (available * size.value) / 100;
      track.limit = track.base;
    } else {
      track.intrinsicMin = true;
      track.intrinsicMax = true;
      track.auto = true;
    }
    return track;
  }
  if (isAutoLength(size)) {
    track.intrinsicMin = true;
    track.intrinsicMax = true;
    track.auto = true;
    return track;
  }
  if (isFrLength(size)) {
    // `fr` is minmax(auto, fr): a single-span item's min-content still
    // raises its base, so an fr column never gets narrower than a word.
    track.flex = size.value;
    track.intrinsicMin = true;
    return track;
  }
  if (isMinMaxTrack(size)) {
    const { min, max } = size;
    if (typeof min === 'number') {
      track.base = min;
    } else if (isPercentLength(min) && available !== undefined) {
      track.base = (available * min.value) / 100;
    } else {
      track.intrinsicMin = true;
    }
    if (typeof max === 'number') {
      track.limit = max;
    } else if (isPercentLength(max) && available !== undefined) {
      track.limit = (available * max.value) / 100;
    } else if (isFrLength(max)) {
      track.flex = max.value;
    } else {
      track.intrinsicMax = true;
      track.auto = true;
    }
    return track;
  }
  throw new Error(`Invalid grid track size ${JSON.stringify(size)}. Use a number, percent(), auto, fr() or minmax().`);
}

function rangeHasFlex(tracks: WorkTrack[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (tracks[i].flex > 0) {
      return true;
    }
  }
  return false;
}

function rangeAllFlex(tracks: WorkTrack[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (tracks[i].flex === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Raises the bases (or limits) of the intrinsic tracks an item spans
 * until the span holds the item's contribution, sharing the shortfall
 * equally. A limit still infinite counts as its base.
 */
function distributeToTracks(
  tracks: WorkTrack[],
  start: number,
  end: number,
  contribution: number,
  gap: number,
  field: 'base' | 'limit'
): void {
  const receivers: WorkTrack[] = [];
  let current = gap * (end - start - 1);
  for (let i = start; i < end; i++) {
    const track = tracks[i];
    const value = field === 'base' ? track.base : isFinite(track.limit) ? track.limit : track.base;
    current += value;
    if (field === 'base' ? track.intrinsicMin : track.intrinsicMax) {
      receivers.push(track);
    }
  }
  const shortfall = contribution - current;
  if (shortfall <= 0 || receivers.length === 0) {
    return;
  }
  const share = shortfall / receivers.length;
  for (const track of receivers) {
    if (field === 'base') {
      track.base += share;
    } else {
      track.limit = (isFinite(track.limit) ? track.limit : track.base) + share;
    }
  }
}

/** Grows bases toward limits, equally, until the space or the limits run out. */
function growTowardLimits(tracks: WorkTrack[], free: number): void {
  let remaining = free;
  for (let guard = 0; guard < tracks.length + 1 && remaining > 1e-9; guard++) {
    const growable = tracks.filter(track => track.flex === 0 && track.limit > track.base + 1e-9);
    if (growable.length === 0) {
      return;
    }
    const share = remaining / growable.length;
    let used = 0;
    for (const track of growable) {
      const grow = Math.min(share, track.limit - track.base);
      track.base += grow;
      used += grow;
    }
    remaining -= used;
    if (used <= 1e-9) {
      return;
    }
  }
}

/**
 * The fr size for a definite space (CSS Grid §11.7.1): the leftover after
 * inflexible tracks, divided by the flex factors — treating any flexible
 * track whose base already exceeds its share as inflexible and repeating.
 */
function findFrSize(tracks: WorkTrack[], space: number): number {
  const inflexible = new Set<WorkTrack>();
  for (;;) {
    let leftover = space;
    let factors = 0;
    for (const track of tracks) {
      if (track.flex > 0 && !inflexible.has(track)) {
        factors += track.flex;
      } else {
        leftover -= track.base;
      }
    }
    if (factors <= 0) {
      return 0;
    }
    const hypothetical = Math.max(0, leftover) / Math.max(factors, 1);
    let changed = false;
    for (const track of tracks) {
      if (track.flex > 0 && !inflexible.has(track) && track.base > hypothetical * track.flex) {
        inflexible.add(track);
        changed = true;
      }
    }
    if (!changed) {
      return hypothetical;
    }
  }
}
